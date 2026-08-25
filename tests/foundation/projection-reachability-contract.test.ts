import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/canonical-iteration';
import { PROJECTION_IDS } from '../../src/simulation/protocol/types';
import { PROJECTION_CATALOG } from '../../src/simulation/worker/projection-catalog';

/**
 * The fourth member of the reachability family, after the fault-code, the
 * challenge-rejection-code and the protocol-message-kind gates. It measures
 * the thing issue #104 is about, and that none of the other three can see.
 *
 * #104's finding, in its own words:
 *
 * > **Eleven of the thirteen exported projection functions are called from
 * > nowhere outside `src/simulation/presentation/`.** Their only other
 * > consumers are their own tests.
 *
 * and its ask:
 *
 * > The two that *are* reachable arrived as **two separate special cases**,
 * > which is the second pattern this issue was filed to prevent.
 *
 * The message-kind gate one directory over cannot catch either. It asks
 * whether a *message kind* has a sender, and a read model with no message at
 * all is invisible to it: `simulation/status-counts` was sent, provokable and
 * green throughout the period in which nine of the ten projections it was
 * supposed to have generalised were unreachable. So this gate asks the
 * question in the read model's own terms -- **does every exported projection
 * have a route out of the worker** -- and answers it from the two artefacts
 * that decide it: the projection sources themselves, and the catalog that
 * binds them to the wire.
 *
 * ## Why this is worth more than any individual wiring
 *
 * The wirings are already asserted, twice over. `PROJECTION_CATALOG` is a
 * `Record<ProjectionId, ProjectionCatalogEntry>`, so a declared id with no
 * entry does not compile, and `tests/contract/worker-projection-channel.test.ts`
 * drives every entry through a real state machine, so an entry that throws
 * fails. Both of those are gates on the *declared vocabulary*.
 *
 * What neither can see is a projection that was never declared: somebody adds
 * `projectVisitation` to `src/simulation/presentation/`, writes it, tests it,
 * and stops -- and the compiler is happy, the catalog is complete, the channel
 * is healthy, and the interface cannot reach the new read model. That is
 * exactly how eleven of thirteen got where they were, one function at a time,
 * with a green suite the whole way. **This file is the gate that fails on
 * that**, because it starts from the directory rather than from the
 * vocabulary.
 *
 * ## What it does not claim
 *
 * It is a text scan over two directories, and the floor it asserts is "this
 * projection has a route", not "a panel paints it". A route with nothing on
 * the end of it is a real and separate state, and it is the state this
 * repository is in today -- recorded below as `UNPAINTED_ROUTE` rather than
 * left for the next reader to rediscover, and written so that the day a panel
 * calls the requester the entry goes stale and this file fails until it is
 * deleted.
 */

const ROOT = join(__dirname, '../..');
const PRESENTATION_DIR = 'src/simulation/presentation';
const CATALOG_FILE = 'src/simulation/worker/projection-catalog.ts';
const UI_DIR = 'src/ui';

const read = (path: string): string => stripComments(readFileSync(join(ROOT, path), 'utf8'));

/**
 * Every exported projection in the read-model layer, as declared in source.
 *
 * Read from the files rather than from `src/simulation/presentation/index.ts`,
 * because the index re-exports with `export *` and a barrel cannot be
 * enumerated statically. The naming convention is the repository's own and is
 * pinned by the vacuity guard below: every one of these is `project<Thing>`.
 */
function exportedProjections(): readonly { readonly file: string; readonly name: string }[] {
  const found: { file: string; name: string }[] = [];
  for (const entry of [...readdirSync(join(ROOT, PRESENTATION_DIR))].sort()) {
    if (!entry.endsWith('.ts')) continue;
    const file = `${PRESENTATION_DIR}/${entry}`;
    for (const match of read(file).matchAll(/^export function (project[A-Za-z0-9_]*)/gm)) {
      found.push({ file, name: match[1]! });
    }
  }
  return found;
}

const PROJECTIONS = exportedProjections();

/**
 * Projections that reach the interface by a route other than the general
 * channel, with what carries them.
 *
 * A reason must name the module and the message, so that a route that is
 * deleted or moved leaves an entry a reader can check. It must state what is
 * true today and must not describe a plan.
 */
const ROUTED_ELSEWHERE: Readonly<Record<string, string>> = {
  projectClockPosition:
    'Reached from `src/ui/simulation-clock.ts:1`, which calls it on the *main* thread over the tick carried by `simulation/clock-state` (PR #94). It is the one projection here with no simulation state behind it -- a pure function from a tick count to a day and a position within the day -- so a request/response round trip would be a message pair spent on arithmetic the caller can already do. It is deliberately absent from `PROJECTION_IDS` for that reason, and `src/ui/simulation-clock.ts` is where the deletion of this entry would have to start.',
};

/**
 * The state of the route the catalog provides, this side of a panel.
 *
 * Recorded rather than left implicit, because "there is a pipe" and "something
 * drinks from it" are different facts and the gap between them is exactly what
 * #104 was filed about. The entry is written so it **goes stale on success**:
 * the assertion below fails the moment a module under `src/ui/` other than the
 * requester itself mentions `SimulationProjectionRequester`, and the fix is to
 * delete this entry in the same change.
 */
const UNPAINTED_ROUTE =
  'The channel exists and no panel calls it yet. `src/ui/simulation-projections.ts` is the main thread\'s requester and the only module under `src/` that constructs a `simulation/request-projection`; nothing constructs a `SimulationProjectionRequester`. That is the scope #104 itself draws -- "Not in scope: what to *do* with the data. The explanation panel, blocked-intent reporting and onboarding predicates are separate issues that consume this channel" -- and building a roster panel, its localization keys and its layout inside the change that laid the pipe would have been the scope broadening `AGENTS.md` forbids. What is *not* deferred is the pipe being reachable: the requester is a main-thread module a panel constructs with the channel it already holds, and every projection answers over it (`tests/contract/worker-projection-channel.test.ts`).';

const catalogSource = read(CATALOG_FILE);

/** A projection the catalog actually calls: `projectThing(` in the catalog's source. */
const catalogued = (name: string): boolean => new RegExp(`\\b${name}\\s*\\(`).test(catalogSource);

describe('every projection the worker can produce has a route out of it', () => {
  it('scans the read-model layer it means to, and really finds projections in it', () => {
    // Vacuity guard, both halves. An empty directory listing or a regex that
    // stopped matching would make every assertion below true of an empty set,
    // which reads exactly like compliance -- the failure this whole family of
    // gates exists to prevent.
    expect(PROJECTIONS.length).toBeGreaterThanOrEqual(13);
    expect(new Set(PROJECTIONS.map(({ name }) => name)).size).toBe(PROJECTIONS.length);
    // Named files, so a projection module that is renamed or moved out of the
    // scanned directory fails here rather than silently leaving the surface.
    const files = new Set(PROJECTIONS.map(({ file }) => file));
    for (const expected of [
      'clock-projection.ts',
      'contraband-projection.ts',
      'incident-projection.ts',
      'prisoner-projection.ts',
      'room-projection.ts',
      'security-projection.ts',
      'staff-projection.ts',
      'status-strip-projection.ts',
      'world-projection.ts',
    ]) {
      expect(files, `${expected} exports no projection any more`).toContain(`${PRESENTATION_DIR}/${expected}`);
    }
    // And the catalog scan really reads source: an emptied file would make
    // `catalogued` false for everything, which is loud, but a stripper that
    // blanked it would do the same silently.
    expect(catalogSource.length).toBeGreaterThan(2_000);
    expect(catalogued('projectStatusStrip')).toBe(true);
  });

  it('gives every exported projection a route, or an entry saying which other one carries it', () => {
    const unreachable = PROJECTIONS.filter(({ name }) => !catalogued(name) && ROUTED_ELSEWHERE[name] === undefined);
    expect(
      unreachable.map(({ file, name }) => `${file}::${name}`),
      'this projection can be produced and cannot leave the worker. Add it to `PROJECTION_IDS` and give it a `PROJECTION_CATALOG` entry, or -- if something else already carries it -- record that here with the module and the message that do',
    ).toEqual([]);

    for (const [name, reason] of Object.entries(ROUTED_ELSEWHERE)) {
      expect(reason.trim().length, `${name} needs a reason naming its route`).toBeGreaterThan(80);
    }
  });

  it('keeps the other-route list honest in both directions', () => {
    const declared = new Set(PROJECTIONS.map(({ name }) => name));

    expect(
      Object.keys(ROUTED_ELSEWHERE).filter((name) => !declared.has(name)),
      'this key is not an exported projection, so its entry accounts for nothing and can never go stale',
    ).toEqual([]);

    expect(
      Object.keys(ROUTED_ELSEWHERE).filter((name) => catalogued(name)),
      'this projection is now on the general channel too, so its entry no longer describes the only route -- delete it, or rewrite it to say what the second route is for',
    ).toEqual([]);
  });

  it('declares exactly the projections the catalog binds, and binds exactly what it declares', () => {
    // The compiler already refuses a `Record<ProjectionId, ...>` with a
    // missing key, so this cannot fail today by that route. It is here for the
    // one the compiler cannot see: `PROJECTION_IDS` is what the *wire* enum is
    // built from, and a member deleted from the tuple while its catalog entry
    // stayed would leave an entry nothing can ask for.
    expect(Object.keys(PROJECTION_CATALOG).sort()).toEqual([...PROJECTION_IDS].sort());
    expect(PROJECTION_IDS.length).toBe(new Set(PROJECTION_IDS).size);
  });

  it('binds every catalogued id to a projection that exists in the read-model layer', () => {
    // The other direction of the scan: an entry whose body calls nothing from
    // `src/simulation/presentation/` is a route to a hand-rolled view model,
    // which is the duplication `AGENTS.md` boundary 1 and this layer exist to
    // prevent. Measured per entry rather than in aggregate, so the failure
    // names the id.
    const projectionNames = PROJECTIONS.map(({ name }) => name);
    const entries = [...catalogSource.matchAll(/'((?:hud|world)\/[a-z-]+)':\s*\{([\s\S]*?)\n  \},/g)];
    expect(entries.length, 'the catalog entry scan matched nothing, so the rule below asserts about an empty list').toBe(PROJECTION_IDS.length);

    for (const [, id, body] of entries) {
      const calls = projectionNames.filter((name) => new RegExp(`\\b${name}\\s*\\(`).test(body!));
      expect(calls.length, `${id!} calls no projection from ${PRESENTATION_DIR}/`).toBeGreaterThan(0);
    }
  });

  it('records that the route has no painter yet, and fails when it gains one', () => {
    // This is the entry that goes stale on success. It is not a licence for
    // the channel to stay unused: it is the thing that makes "unused" visible
    // in CI instead of in the next audit.
    expect(UNPAINTED_ROUTE.trim().length).toBeGreaterThan(200);

    const painters = readdirSync(join(ROOT, UI_DIR))
      .filter((entry) => entry.endsWith('.ts') && entry !== 'simulation-projections.ts')
      .filter((entry) => read(`${UI_DIR}/${entry}`).includes('SimulationProjectionRequester'));

    expect(
      painters,
      'a module now uses the projection requester, so `UNPAINTED_ROUTE` above is out of date -- delete it in the same change that made it false',
    ).toEqual([]);

    // The other half of the same fact: the requester exists and is the sender.
    // Without this the assertion above would be equally green if the requester
    // had been deleted.
    expect(read(`${UI_DIR}/simulation-projections.ts`)).toContain("kind: 'simulation/request-projection',");
  });
});
