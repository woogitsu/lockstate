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
 * projection has a route", not "a panel paints it". A route with nothing on the
 * end of it is a real and separate state, and it was this repository's state
 * until #331's milestone: this file used to carry a `UNPAINTED_ROUTE` entry
 * recording it, written so that the day a module under `src/ui/` called the
 * requester the entry went stale and this file failed until it was deleted.
 * That is what happened -- `src/ui/simulation-room-needs.ts` reads
 * `hud/room-list` and `hud/room-detail` to tell the player what a zoned room is
 * missing -- so the entry is gone and the assertion that replaced it runs the
 * other way: **there must be a painter**, and deleting the last one fails here
 * rather than quietly returning the channel to a pipe with nothing on the end
 * of it. It still does not claim that every projection is painted; **nine of the
 * fifteen catalogued read models have a route and no reader.**
 *
 * That number is stated with the way to re-derive it, because it is a tally and
 * this file's whole subject is claims that rot. `PROJECTION_IDS`
 * (`src/simulation/protocol/types.ts:314-330`) has fifteen members; grepping all
 * fifteen as string literals across `src/ui/` and `src/rendering/` returns
 * **six**, so fifteen minus six is nine. The six are `hud/room-list` and
 * `hud/room-detail` (`simulation-room-needs.ts:172,179`), `hud/held-guards`
 * (`simulation-held-guards.ts:148`), `hud/pending-deliveries`
 * (`simulation-pending-deliveries.ts:149`), `hud/prisoner-population`
 * (`simulation-intake.ts:162`) and `hud/build-queue`
 * (`simulation-build-queue.ts:146`). `src/rendering/` matches none.
 *
 * **This said "ten", and the arithmetic slip is the interesting part rather than
 * the digit.** Six ids are read by *five* modules, because
 * `simulation-room-needs.ts` reads two of them -- so a count of reader files
 * gives five and fifteen minus five gives ten. The sentence is about read
 * *models*, not reader modules, and the two stop agreeing the moment one module
 * requests two projections. It was already wrong when it was written, and the
 * same off-by-one from the same cause was independently found in
 * `docs/HUD_PROJECTIONS.md` §9; ADR 0040's open question 4 has had nine right
 * all along.
 *
 * A literal grep can only prove a *lower* bound on readers -- a module that
 * built an id at runtime would be invisible to it -- so that was checked
 * separately rather than assumed: the only place in `src/ui/` or
 * `src/rendering/` that holds a `ProjectionId` as a value instead of a literal
 * is `simulation-projections.ts:159`, the requester's own signature, which is
 * the transport every one of the six calls through rather than a reader of any
 * particular projection. So there is no indirect resolution to miss, and nine is
 * exact rather than an upper bound.
 *
 * The second painter is `src/ui/simulation-build-queue.ts`, and it is worth
 * naming because it closed a *different* gap from the room readout's. That one
 * made a verdict visible. This one carries the **order ids** of the orders that
 * are still pending, which is what `CancelBuildOrder` names -- and until it
 * existed that command was the repository's only one with no production
 * producer, because no control could aim at an order nothing had told this
 * thread about. So this channel is now the route by which a *command* becomes
 * reachable, not only the route by which a readout does.
 *
 * The fourth is `src/ui/simulation-pending-deliveries.ts`, over
 * `hud/pending-deliveries`, and it is the second time this channel is what makes
 * a *command* reachable rather than a readout -- with the difference that what
 * sat unreachable behind it was not a control but a **credit** (#285).
 * `ProcurementSystem.cancel` refunds the recorded price of a delivery that has
 * not landed, exactly, and every caller in the repository was a test -- so the
 * one thing besides the state income line that puts money back into the treasury
 * could not happen in any session a player could drive. A purchase id is minted
 * on the main thread and immediately forgotten; this projection is what carries
 * it back, so a control can name one.
 *
 * The fifth is `src/ui/simulation-held-guards.ts`, over `hud/held-guards`, and it
 * is the **third** time this channel is what makes a *command* reachable rather
 * than a readout -- with the difference that what sat unreachable behind it was
 * neither a control nor a credit but a **release** (ADR 0034, answering ADR 0033's
 * open question 3). `GuardRoster.unassign` has been complete since #26 and every
 * caller of it in `src/` sits inside the system that made the claim being
 * released, each firing only when that system decides the claim is over -- so a
 * claim whose owner had lost track of it was permanent, which is what issue #352
 * measured as four guards held for ever. A guard id is minted inside the
 * simulation and never reached this thread at all; this projection is what
 * carries it out, together with the one fact the roster cannot answer on its own
 * -- which of the two `'on-search'` claimants holds the guard.
 *
 * The third is `src/ui/simulation-intake.ts`, over `hud/prisoner-population`,
 * and it is the first one about *people* rather than about the building: it
 * says where the arrivals the player has already admitted are, which is the
 * difference between an admission that is waiting for a cell and one that can
 * never be housed at all. Neither state had a surface, although the strip
 * counted both among the population.
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
 * The modules that actually drink from the channel.
 *
 * The other half of #104's question, and the one no other gate asks: "there is
 * a pipe" and "something drinks from it" are different facts. This list is the
 * second, and it is a *floor* rather than a manifest -- a new reader may be
 * added without touching it, and the last one being deleted fails the
 * assertion below. Named individually so that a reader which is renamed or
 * moved out of `src/ui/` fails here instead of silently leaving the surface.
 */
const PAINTERS = [
  'simulation-build-queue.ts',
  'simulation-held-guards.ts',
  'simulation-intake.ts',
  'simulation-pending-deliveries.ts',
  'simulation-room-needs.ts',
] as const;

const catalogSource = read(CATALOG_FILE);

/** A projection the catalog actually calls: `projectThing(` in the catalog's source. */
const catalogued = (name: string): boolean => new RegExp(`\\b${name}\\s*\\(`).test(catalogSource);

describe('every projection the worker can produce has a route out of it', () => {
  it('scans the read-model layer it means to, and really finds projections in it', () => {
    // Vacuity guard, both halves. An empty directory listing or a regex that
    // stopped matching would make every assertion below true of an empty set,
    // which reads exactly like compliance -- the failure this whole family of
    // gates exists to prevent.
    expect(PROJECTIONS.length).toBeGreaterThanOrEqual(14);
    expect(new Set(PROJECTIONS.map(({ name }) => name)).size).toBe(PROJECTIONS.length);
    // Named files, so a projection module that is renamed or moved out of the
    // scanned directory fails here rather than silently leaving the surface.
    const files = new Set(PROJECTIONS.map(({ file }) => file));
    for (const expected of [
      'clock-projection.ts',
      'contraband-projection.ts',
      'guard-release-projection.ts',
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

  it('has a module that actually reads the channel, and says which', () => {
    const painters = readdirSync(join(ROOT, UI_DIR))
      .filter((entry) => entry.endsWith('.ts') && entry !== 'simulation-projections.ts')
      .filter((entry) => read(`${UI_DIR}/${entry}`).includes('SimulationProjectionRequester'));

    // The assertion this file used to make in reverse. Until #331's milestone
    // the channel had a route and no reader, which was recorded here as a
    // standing entry rather than left for the next audit; the entry has been
    // deleted and this is what took its place. An empty list is a channel that
    // has gone back to being a pipe with nothing on the end of it.
    expect(
      painters.length,
      'no module under src/ui/ reads a projection any more. The channel is a pull with nothing pulling: give a panel back its reader, or this whole layer is eleven read models nobody can see (#104)',
    ).toBeGreaterThan(0);

    // And the named ones are still there, so a reader that is renamed or moved
    // out of the tree fails here rather than being replaced in silence by
    // whichever other module happens to satisfy the count above.
    expect(
      [...PAINTERS].filter((entry) => !painters.includes(entry)),
      'this reader no longer uses the projection requester: update PAINTERS in the same change, or the list becomes fiction',
    ).toEqual([]);

    // The other half of the same fact: the requester exists and is the sender.
    // Without this the assertions above would be equally green if the requester
    // had been deleted and the readers were mentioning a name that no longer
    // sends anything.
    expect(read(`${UI_DIR}/simulation-projections.ts`)).toContain("kind: 'simulation/request-projection',");
  });
});
