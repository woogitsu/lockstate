import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/canonical-iteration';
import {
  PRODUCTION_ENTRY_POINTS,
  reachableModules,
  readFromDisk,
  repositoryRoot,
  type ReadModule,
} from '../helpers/production-reachability';

/**
 * A startup guarantee has to live in a module the shipped build actually
 * loads.
 *
 * Issue #315. `src/content/index.ts` performed the catalogues'
 * room-to-object cross-reference validation at import time, and both that file
 * and `docs/CONTENT.md` said it failed fast at startup. It never ran in a
 * shipped build. The barrel had one importer under `src/`
 * (`src/simulation/rooms/definition.ts`), and *that* module's only importer is
 * a test, so nothing in the production graph reached the file and the bundler
 * dropped the module and its `throw` together. Measured in the artefact rather
 * than inferred: `dist/assets/index-*.js` carried each catalogue's own
 * "Default room catalog failed validation" throw -- those modules are imported
 * directly -- and no occurrence of "cross-reference validation" anywhere.
 *
 * Nothing failed while that was true, and that is the part worth a gate. `tsc`
 * was clean. `pnpm test` was green, and could not be otherwise: the tests
 * import the barrel, so the check ran for them and only for them. `vite dev`
 * ran it too, so it held for every developer and for no player. The one layer
 * that disagreed was the artefact, and nothing read the artefact.
 *
 * So this walks the value-import graph from the production entry points and
 * asserts that the modules carrying an import-time `throw` under
 * `src/content/` are in it. It is deliberately the *general* rule rather than
 * one assertion about the one check that broke: every catalogue in that
 * directory validates itself at import time by the same convention, eight of
 * them today, and a ninth added in a module nothing imports would be the same
 * defect with a different name.
 *
 * ## What this proves and what it cannot
 *
 * Reachable is not the same as emitted. This walk says the bundler is given
 * the module; whether the bundler keeps a top-level side effect is a judgement
 * about purity that Vite, Rolldown or a change to the module's shape can alter
 * without touching a line under `src/content/`. Only the bundler can settle
 * that, so the second half of this gate is a plugin in `vite.config.ts` that
 * greps the emitted client chunk for the throw text and fails the build. The
 * two are complements: this one runs in `pnpm test` and names the module and
 * the reason, that one runs in `pnpm build` and reads the bytes a player
 * downloads. Both are on the CI path through `pnpm verify`.
 */

/**
 * A `throw` that runs when the module is imported, as opposed to one inside a
 * function or method that runs when something calls it.
 *
 * Indentation is the discriminator, and it is enough here because every
 * import-time check in `src/content/` is written the same way -- a top-level
 * `if` over a collected error list, so the `throw` sits at two spaces --
 * while `registry.ts`'s `RangeError`s are inside a method inside a class and
 * sit at six. That is asserted below in both directions rather than assumed,
 * since a detector that silently stopped matching would make every claim in
 * this file vacuous.
 */
const IMPORT_TIME_THROW = /^ {0,2}throw\b/mu;

/** The text `src/content/room-catalog.ts` throws, and the marker `vite.config.ts` looks for in the artefact. */
const CROSS_REFERENCE_THROW = 'failed cross-reference validation';

/** Every content module, as repository-relative paths, sorted. */
function contentModules(): readonly string[] {
  return readdirSync(path.join(repositoryRoot, 'src', 'content'))
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .sort()
    .map((name) => path.posix.join('src', 'content', name));
}

/*
 * The walk moved to `tests/helpers/production-reachability.ts` when
 * `tests/foundation/trusted-tier-reachability-contract.test.ts` (#378) needed
 * to ask a second question of it, and these fixtures moved nowhere: they are
 * what pins it, so they keep exercising it from here rather than being
 * duplicated beside the second caller. A second copy of a scanning rule is
 * #188, and this walk sits directly on the scanner that defect was found in.
 */
describe('the walk itself, against a written-out graph', () => {
  const graph = (files: Record<string, string>): ReadModule => (repoPath) => files[repoPath];

  it('follows a value import', () => {
    const read = graph({
      'src/main.ts': "import { thing } from './lib/thing';\n",
      'src/lib/thing.ts': 'export const thing = 1;\n',
    });
    expect([...reachableModules(read, ['src/main.ts'])].sort()).toEqual(['src/lib/thing.ts', 'src/main.ts']);
  });

  it('does not follow a type-only import, because an erased import runs nothing', () => {
    const read = graph({
      'src/main.ts': "import type { Thing } from './lib/thing';\nexport const x: Thing = 1;\n",
      'src/lib/thing.ts': 'export type Thing = number;\n',
    });
    expect([...reachableModules(read, ['src/main.ts'])]).toEqual(['src/main.ts']);
  });

  it('follows a type-only import when asked, which is how "erased" is told apart from "absent"', () => {
    // The option `trusted-tier-reachability-contract.test.ts` turns on to
    // distinguish a module that contributes no code because it is erased
    // (`src/persistence/local/store.ts`, all interfaces) from one that
    // contributes none because nothing reaches it at all. Both come back
    // unreachable from the default walk, and only one of them is a candidate
    // for deletion.
    const read = graph({
      'src/main.ts': "import type { Thing } from './lib/thing';\nexport const x: Thing = 1;\n",
      'src/lib/thing.ts': 'export type Thing = number;\n',
    });
    expect([...reachableModules(read, ['src/main.ts'], { followTypeOnly: true })].sort()).toEqual([
      'src/lib/thing.ts',
      'src/main.ts',
    ]);
  });

  it('follows a `?worker` specifier, which is how the client entry reaches the simulation kernel', () => {
    const read = graph({
      'src/main.ts': "import W from './simulation/worker/worker.ts?worker';\nnew W();\n",
      'src/simulation/worker/worker.ts': 'export default 1;\n',
    });
    expect([...reachableModules(read, ['src/main.ts'])].sort()).toEqual([
      'src/main.ts',
      'src/simulation/worker/worker.ts',
    ]);
  });

  it('resolves a directory specifier to its index module, which is how a barrel is reached when it is reached', () => {
    const read = graph({
      'src/main.ts': "export * from './content';\n",
      'src/content/index.ts': 'export const x = 1;\n',
    });
    expect([...reachableModules(read, ['src/main.ts'])].sort()).toEqual(['src/content/index.ts', 'src/main.ts']);
  });

  it('ignores a bare specifier and terminates on a cycle', () => {
    const read = graph({
      'src/main.ts': "import 'zod';\nimport './a';\n",
      'src/a.ts': "import './b';\n",
      'src/b.ts': "import './a';\n",
    });
    expect([...reachableModules(read, ['src/main.ts'])].sort()).toEqual(['src/a.ts', 'src/b.ts', 'src/main.ts']);
  });

  it('reports nothing for an entry point that does not exist, rather than throwing', () => {
    expect([...reachableModules(graph({}), ['src/gone.ts'])]).toEqual([]);
  });
});

describe('the import-time throw detector, in both directions', () => {
  it('flags a top-level throw', () => {
    expect(IMPORT_TIME_THROW.test('if (errors.length > 0) {\n  throw new Error(errors);\n}\n')).toBe(true);
  });

  it('does not flag a throw inside a method', () => {
    const method = 'class R {\n  public add(): void {\n    if (bad) {\n      throw new RangeError("no");\n    }\n  }\n}\n';
    expect(IMPORT_TIME_THROW.test(method)).toBe(false);
  });

  it('agrees with the real files it is pointed at', () => {
    // The fixtures above pin the rule; these pin that the rule still describes
    // this repository's two shapes. `registry.ts` is the one content module
    // whose throws are all inside a class, and it is the file a looser
    // detector would start reporting.
    expect(IMPORT_TIME_THROW.test(stripComments(readFromDisk('src/content/room-catalog.ts')!))).toBe(true);
    expect(IMPORT_TIME_THROW.test(stripComments(readFromDisk('src/content/object-catalog.ts')!))).toBe(true);
    expect(IMPORT_TIME_THROW.test(stripComments(readFromDisk('src/content/registry.ts')!))).toBe(false);
  });
});

describe('every import-time content check is in the production module graph', () => {
  const reached = reachableModules(readFromDisk, PRODUCTION_ENTRY_POINTS);

  it('walks a real graph from real entry points, so the assertions below cannot pass vacuously', () => {
    for (const entry of PRODUCTION_ENTRY_POINTS) {
      expect(readFromDisk(entry), `${entry} is not readable; the production entry points have moved`).toBeDefined();
      expect(reached.has(entry)).toBe(true);
    }
    // A walk that stopped following imports would report the two entry points
    // and pass every assertion below by finding nothing to check.
    expect(reached.size, 'the walk reached almost nothing; it is not following imports any more').toBeGreaterThan(150);
    expect(reached.has('src/content/room-catalog.ts')).toBe(true);
  });

  it('carries the cross-reference validation in exactly one module, and that module is reached', () => {
    const declaring = contentModules().filter((module) =>
      stripComments(readFromDisk(module) ?? '').includes(CROSS_REFERENCE_THROW),
    );

    // Comment-stripped: this file, `src/content/index.ts` and
    // `room-catalog.ts` all *discuss* the check at length, and a scan that
    // could not tell a sentence about a throw from a throw would have passed
    // on the broken tree #315 reported.
    expect(
      declaring,
      'the room-to-object cross-reference validation is no longer thrown from exactly one content module. It is the guarantee docs/CONTENT.md describes; if it moved, move the marker in vite.config.ts and the sentence in docs/CONTENT.md in the same change',
    ).toEqual(['src/content/room-catalog.ts']);

    expect(
      reached.has(declaring[0]!),
      `${declaring[0]} performs the cross-reference validation at import time and nothing in the production graph imports it, which is exactly the state issue #315 reported: the check runs under \`vite dev\` and in this test suite, and not in the build a player loads`,
    ).toBe(true);
  });

  it('reaches every content module that validates itself at import time', () => {
    const unreached = contentModules()
      .filter((module) => IMPORT_TIME_THROW.test(stripComments(readFromDisk(module) ?? '')))
      .filter((module) => !reached.has(module));

    expect(
      unreached,
      'a content module throws at import time and the production build never imports it, so the check it performs holds in development and in this suite only -- the shape of #315. Either something in the production graph must import it, or the check belongs in a module that is already imported',
    ).toEqual([]);
  });

  it('keeps the barrel free of anything that has to run', () => {
    // `src/content/index.ts` is where the check used to be, and the barrel is
    // structurally the wrong home for one: it is the module a direct import is
    // always free to skip, so whether the guarantee holds depends on which
    // specifier a consumer happens to write. Every module under `src/` writes
    // the direct one.
    const barrel = stripComments(readFromDisk('src/content/index.ts')!);
    expect(
      IMPORT_TIME_THROW.test(barrel),
      'src/content/index.ts has an import-time throw again. Nothing in the production graph imports the barrel (this file asserts that below), so a guarantee placed there runs for `vite dev` and for tests and not for players -- issue #315',
    ).toBe(false);
  });

  it('still does not reach the barrel, which is why the check is not in it', () => {
    // The negative control for the walk on the real tree, and the fact that
    // makes the assertion above worth making. If a production module starts
    // importing `src/content/**`'s barrel this goes red -- and the answer is
    // not to move the check back, since a *second* consumer importing
    // `room-catalog.ts` directly would skip it again.
    expect(
      reached.has('src/content/index.ts'),
      'something in the production graph now imports src/content/index.ts. That is not a defect by itself, but it does not make the barrel a safe home for a startup check -- leave the validation in room-catalog.ts and delete this assertion with a note if the import is deliberate',
    ).toBe(false);
  });

  it('still does not reach the second RoomRegistry, as docs/CONTENT.md says', () => {
    // #315's other half, recorded rather than resolved: a ~200-line module with
    // a `RoomRegistry` of its own whose only importer is
    // `tests/unit/rooms-catalog-integration.test.ts`. `docs/CONTENT.md` says
    // outright that `defaultRoomRegistry` has no consumer in `src/`, and this
    // is that sentence asserted. A consumer arriving is a feature, not a
    // regression -- say so in that document in the same change.
    expect(
      reached.has('src/simulation/rooms/definition.ts'),
      'src/simulation/rooms/definition.ts is now in the production graph. docs/CONTENT.md states it has no consumer in src/ and is kept as the runtime-side room vocabulary real object-placement work will need -- correct that section in the same change',
    ).toBe(false);
  });
});
