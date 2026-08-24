import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  describeConstructionSite,
  describeDependency,
  findBrowserGlobalAccess,
  reportConstructionSites,
  findCrossTreeDependencies,
  findImports,
  reportCrossTreeViolations,
  type CrossTreeAllowance,
  type ScannedSource,
} from '../helpers/module-boundaries';

/**
 * `docs/INPUT.md`'s opening sentence, made executable:
 *
 * > *"Input is a renderer-agnostic, user-settings concern. Gameplay and camera
 * > consumers receive semantic action IDs such as `camera.up`, never localized
 * > key characters."*
 *
 * and the same document's rule about storage:
 *
 * > *"Settings persistence goes through an injectable `KeyValueStore`
 * > (`getItem`/`setItem`), not a hard-coded browser global, so tests stay
 * > headless."*
 *
 * Until #206 nothing enforced either. `src/input/**` was one of two trees under
 * `src/` outside every boundary test -- and it is, by this measure, close to
 * the cleanest tree in the repository: every one of its imports is either
 * intra-tree or the single type-only `KeyValueStore` contract, it imports no
 * package at all, and it reaches for exactly one browser global, in the one
 * function whose job is to produce the browser store for the composition root
 * to inject. That is a state worth pinning while it is still true rather than
 * after, which is why this file exists with two allow-lists holding one entry
 * each.
 *
 * Both entries are recorded facts about today, not permissions granted in
 * advance -- and both lists fail in both directions, so an entry whose subject
 * disappears is as loud as an unrecorded new dependency.
 *
 * Two of the rules are load-bearing for open work rather than decorative:
 *
 * - the browser-global rule is what #199 was about from the other side (a
 *   field initializer in `src/rendering/scene/world-scene.ts` reading
 *   `window.localStorage` gave a browser with site data blocked a blank page,
 *   while the seam that exists to prevent exactly that sat unused one tree
 *   over), and it is what keeps the rest of this tree headless-testable;
 * - the renderer rule is what would notice a future remapping UI
 *   (`AGENTS.md` boundary 10, #141) reaching for a Phaser type "just for the
 *   pointer".
 *
 * The scanning rules live in `tests/helpers/module-boundaries.ts` and are
 * exercised against fixtures in both directions in
 * `tests/unit/module-boundary-rules.test.ts`, the same split
 * `tests/determinism/canonical-iteration-contract.test.ts` uses with its
 * helper. A boundary test whose pattern has quietly stopped matching is
 * indistinguishable from a clean tree, which is the defect #206 reported in
 * this file's sibling.
 */

const INPUT_ROOT = join(__dirname, '../../src/input');
const OWN_TREE = 'input';

function collectTypeScriptFiles(directory: string): readonly string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...collectTypeScriptFiles(path));
      continue;
    }
    if (entry.endsWith('.ts')) files.push(path);
  }
  return files;
}

/** Repository-relative, posix-separated, so a failure message reads the same on every platform. */
const inputFiles: readonly ScannedSource[] = collectTypeScriptFiles(INPUT_ROOT).map((path) => ({
  file: posix.join('src', OWN_TREE, relative(INPUT_ROOT, path).split(sep).join(posix.sep)),
  source: readFileSync(path, 'utf8'),
}));

/**
 * Every tree outside `src/input/` that an input module is allowed to know,
 * and why.
 *
 * One entry, and that is the point -- the same shape and the same argument as
 * `tests/unit/services-layer-boundaries.test.ts`'s deliberately empty
 * `MODULES_PERFORMING_IO`. Adding a second entry is a real architectural event:
 * it is the moment `docs/INPUT.md`'s "renderer-agnostic, user-settings
 * concern" stops being true of the tree, and it should require writing down
 * what the tree now depends on, not just adding an import.
 *
 * A reason states what is verifiably true today and is deliberately not a
 * plan; inventing a roadmap for an entry is the invented-consequence defect
 * this repository spends the most effort on.
 */
const ALLOWED_FOREIGN_TREES: readonly CrossTreeAllowance[] = [
  {
    file: 'src/input/storage.ts',
    tree: 'shared',
    kind: 'type-only',
    reason:
      'The injectable `KeyValueStore` contract `docs/INPUT.md` requires: `import type { KeyValueStore } from "../shared/key-value-store"`. It is type-only, so nothing in `src/shared/` runs as a consequence of importing it, and the store itself is supplied by the caller -- `src/main.ts` passes the browser one. That is what keeps this tree headless: every input test constructs its own in-memory store. A value import from `src/shared/` would mean input had started to depend on a shared implementation rather than on a contract, which is a different fact and should fail here.',
  },
];

/**
 * The one place in `src/input/**` that touches a browser global, and why.
 *
 * `docs/INPUT.md`'s rule is about how settings persistence *reaches* storage:
 * "through an injectable `KeyValueStore` (`getItem`/`setItem`), not a
 * hard-coded browser global, so tests stay headless". Every consumer in this
 * tree obeys that -- they are handed a store. What one module must do is
 * *produce* the browser store for the composition root to inject, and
 * `resolveBrowserKeyValueStore` is it.
 *
 * Widening the boundary rule to `globalThis.<global>` is what surfaced this
 * (#206). It is recorded rather than fixed: the placement is a deliberate,
 * argued decision landed by #199 and restated in `docs/INPUT.md`, which says
 * the function "lives in `src/input/` rather than beside the `KeyValueStore`
 * interface in `src/shared/`, because nothing under `src/shared/` references a
 * DOM global and `src/services/` consumes that interface under an asserted
 * no-I/O rule (#121 item 1)". Moving it is an architectural question this test
 * has no business deciding.
 *
 * What the entry buys is the difference between one audited seam and a tree
 * that has quietly started reading browser state: a *second* module here, or a
 * second access in this one, fails. That is precisely the shape #199 was --
 * `world-scene.ts` reading `window.localStorage` in a class field initializer,
 * one tree over, where nothing was looking.
 */
const BROWSER_GLOBAL_SEAMS: readonly { readonly file: string; readonly global: string; readonly reason: string }[] = [
  {
    file: 'src/input/storage.ts',
    global: 'globalThis.localStorage',
    reason:
      '`resolveBrowserKeyValueStore()` -- the single seam that produces the browser `KeyValueStore` the composition root injects. It reads `globalThis.localStorage` inside a `try` and falls back to an in-memory `Map`, because reaching for the property is itself a throwing operation: Chrome raises `SecurityError` from the getter when site data is blocked for the origin, which is the #199 blank-page defect. `docs/INPUT.md` states why the function lives in this tree rather than in `src/shared/`. Every other module here is handed a store and never reaches for one.',
  },
];

const dependencies = findCrossTreeDependencies(inputFiles, OWN_TREE);
const report = reportCrossTreeViolations(dependencies, ALLOWED_FOREIGN_TREES);

describe('input module boundaries', () => {
  it('finds the input sources it is meant to be checking', () => {
    // Vacuity guard, in both halves. An empty file list makes every rule below
    // pass while checking nothing, which is the single most common way a gate
    // in this repository stops protecting anything -- `ui-hud-messages.test.ts`
    // and `rendering-module-boundaries.test.ts` both carry one for the same
    // reason. The named modules make a *shrunken* list fail too, which is the
    // quiet version of the same failure.
    expect(inputFiles.length).toBeGreaterThan(8);
    const names = inputFiles.map(({ file }) => file);
    for (const expected of [
      'src/input/actions.ts',
      'src/input/accessibility.ts',
      'src/input/bindings.ts',
      'src/input/gestures.ts',
      'src/input/index.ts',
      'src/input/keyboard.ts',
      'src/input/pointer.ts',
      'src/input/settings.ts',
      'src/input/storage.ts',
    ]) {
      expect(names).toContain(expected);
    }

    // And the scanner really is reading imports out of these files: a scan
    // that returned nothing at all would make every rule below vacuous in a
    // way the file count cannot see. `src/input/index.ts` is eight
    // `export * from` lines and nothing else, so it is the honest place to pin
    // that -- measured, not derived.
    const barrel = inputFiles.find(({ file }) => file === 'src/input/index.ts')!;
    expect(findImports(barrel.source).length).toBe(8);
    expect(inputFiles.flatMap(({ source }) => findImports(source)).length).toBeGreaterThan(15);
  });

  it('imports no Phaser and no package at all', () => {
    // The stronger fact that is actually true today: `src/input/**` has no
    // third-party dependency whatsoever, Phaser included. Asserting the true
    // stronger rule rather than the weaker one it implies is the treatment
    // `services-layer-boundaries.test.ts` gives its own layer.
    for (const { file, source } of inputFiles) {
      const packages = findImports(source)
        .map((site) => site.specifier)
        .filter((specifier) => !specifier.startsWith('.'));
      expect(
        packages,
        `${file} now imports a package. Input is a renderer-agnostic, user-settings concern (docs/INPUT.md): it emits semantic action ids and owns no engine, DOM or storage type`,
      ).toEqual([]);
    }
  });

  it('depends on no tree outside src/input/ that is not recorded with a reason', () => {
    expect(
      report.unlisted.map(describeDependency),
      'an input module now depends on another tree under src/. docs/INPUT.md calls this tree a renderer-agnostic, user-settings concern: record the dependency in ALLOWED_FOREIGN_TREES with the reason, or remove it',
    ).toEqual([]);
  });

  it('keeps its allow-list honest in both directions', () => {
    expect(
      report.stale.map((entry) => `${entry.file} -> src/${entry.tree}/`),
      'this dependency no longer exists: delete its ALLOWED_FOREIGN_TREES entry in the same change, or the list becomes fiction',
    ).toEqual([]);
    expect(
      report.mismatched.map((entry) => `${entry.allowance.file} -> src/${entry.allowance.tree}/ is recorded as ${entry.allowance.kind} but is now ${entry.actual}`),
      'the recorded kind of this dependency has drifted. A type-only entry that has become a value import is the erosion that matters: the tree stopped depending on a contract and started depending on an implementation',
    ).toEqual([]);

    // The list accounts for every foreign dependency and nothing more, so its
    // length is the number a reviewer has to audit.
    expect(dependencies.length).toBe(ALLOWED_FOREIGN_TREES.length);
  });

  it('gives every allow-list entry a real reason', () => {
    for (const entry of ALLOWED_FOREIGN_TREES) {
      expect(entry.reason.trim().length, `${entry.file} -> src/${entry.tree}/ needs a reason`).toBeGreaterThan(80);
    }
  });

  it('touches no DOM or browser global', () => {
    // `docs/INPUT.md`: settings persistence goes through an injectable
    // `KeyValueStore`, "not a hard-coded browser global, so tests stay
    // headless". `src/input/storage.ts` quotes that rule in its own prose,
    // which is why the scan strips comments before looking.
    const seamKey = (file: string, global: string): string => `${file} :: ${global}`;
    const recorded = new Set(BROWSER_GLOBAL_SEAMS.map((seam) => seamKey(seam.file, seam.global)));
    const found = new Set<string>();
    const offenders: string[] = [];
    let accessCount = 0;

    for (const { file, source } of inputFiles) {
      for (const access of findBrowserGlobalAccess(source)) {
        accessCount += 1;
        const key = seamKey(file, access.global);
        found.add(key);
        if (recorded.has(key)) continue;
        offenders.push(`${file}:${access.line} reads ${access.global}`);
      }
    }

    expect(
      offenders,
      'an input module now reaches for a browser global. That is what #199 was: a field initializer reading window.localStorage gave a browser with site data blocked a blank page, and the seam that exists to prevent it was not used. Storage reaches this tree only through the injected KeyValueStore -- if this really is a new composition seam, record it in BROWSER_GLOBAL_SEAMS with the reason',
    ).toEqual([]);

    // Both directions, and the denominator. A seam whose access is gone leaves
    // a permission nobody needs; and an empty `offenders` list means nothing
    // unless the scan found the access that is really there.
    expect(
      [...recorded].filter((key) => !found.has(key)),
      'this browser-global access no longer exists: delete its BROWSER_GLOBAL_SEAMS entry in the same change, or the list becomes fiction',
    ).toEqual([]);
    expect(accessCount).toBe(BROWSER_GLOBAL_SEAMS.length);

    for (const seam of BROWSER_GLOBAL_SEAMS) {
      expect(seam.reason.trim().length, `${seam.file} -> ${seam.global} needs a reason`).toBeGreaterThan(80);
    }
  });

  it('builds no simulation, which is AGENTS.md boundary 1 from the input side', () => {
    // Redundant with the package and cross-tree rules above while they hold --
    // a module cannot call `createNewSimulationRuntime` without importing it --
    // and asserted anyway, because the cost is one line and the redundancy is
    // the point of a boundary: input orchestration lives on the main thread
    // (boundary 3) and the main thread does not own simulation state.
    const construction = reportConstructionSites(inputFiles);
    // Denominator first: an empty result from a scan that read nothing is not
    // a clean tree, it is no scan.
    expect(construction.scannedFiles).toBe(inputFiles.length);
    expect(construction.scannedFiles).toBeGreaterThan(8);
    expect(construction.sites.map(describeConstructionSite)).toEqual([]);
  });
});
