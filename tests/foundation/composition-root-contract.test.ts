import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/canonical-iteration';

/**
 * The wirings only `src/main.ts` performs, and that nothing else can guard.
 *
 * The composition root is by construction the one module no unit test
 * executes: it reaches for browser globals, constructs a `Worker`, mounts into
 * a real document and runs at import. Every component it connects is tested in
 * isolation, and **the connecting is not tested at all** -- so a seam can be
 * correct, fully covered, and joined to nothing, with the whole suite green.
 *
 * That is not a hypothetical. It has happened three times, and each time the
 * component was flawless:
 *
 * - **#82** -- `mountInterface` sat inside `bootPersistence`, which runs only
 *   when a worker started, so a browser that could not start one got a canvas
 *   and nothing else. The comment on `mountInterface` already described the
 *   intended arrangement; only the placement disagreed with it.
 * - **#199** -- `WorldScene` read `window.localStorage` itself instead of
 *   taking the injected store, so a browser with site data blocked threw before
 *   anything mounted. The seam existed and the one production caller did not
 *   use it. (My own first fix made the option *optional*, and deleting
 *   `main.ts`'s argument then passed every test.)
 * - **#146** -- `AutosaveScheduler` is purely dirty-driven and nothing called
 *   `markDirty`, so the 30-second autosave never fired and the only automatic
 *   save was the best-effort one on `pagehide`.
 *
 * ## What this gate can and cannot prove
 *
 * It is textual, and that bound is real: it proves a wiring is **written**, not
 * that it works. `resolveBrowserKeyValueStore()` appearing in the file does not
 * mean the store reaches the scene, and this file must not be read as
 * evidence that it does -- the behaviour of each seam is asserted in its own
 * unit tests, and `tests/browser/app-shell.spec.ts` is where the assembled page
 * is actually exercised.
 *
 * What it does buy is the one thing those layers cannot: **deleting a line from
 * the composition root fails something.** Measured on #146 before this file
 * existed -- removing `commandSender?.onCommandAccepted(...)` from `main.ts`,
 * which restores the original defect exactly, left `tsc` clean and 1,579 tests
 * passing. That mutation is what this file kills.
 *
 * Entries are therefore *few and load-bearing*. Every one names a defect that
 * actually happened; a wiring nobody has broken does not need a line here, and
 * filling this list with every call in `main.ts` would make it a second copy of
 * the file that nobody reads.
 */

const MAIN_PATH = join(__dirname, '../../src/main.ts');

interface RequiredWiring {
  /** What the wiring is, for the failure message. */
  readonly what: string;
  /**
   * Written as it appears in source, comments stripped. A substring rather than
   * a regex wherever one suffices: a regex that stops matching after a
   * harmless reformat is a gate that fails for the wrong reason, and this
   * repository has already paid for one pattern that quietly stopped matching
   * (#206).
   */
  readonly source: string;
  /** Why it is here: the defect it exists to prevent recurring. */
  readonly reason: string;
}

const REQUIRED_WIRINGS: readonly RequiredWiring[] = [
  {
    what: 'an accepted command marks the session dirty',
    source: 'onCommandAccepted(() => controller.markDirty())',
    reason:
      'Issue #146. `AutosaveScheduler` schedules a save only when something marks the session dirty, and nothing in the application did -- so the 30-second interval was configured, reached the scheduler, and did nothing, leaving the best-effort `pagehide` save as the only automatic write. It also falsified the reasoning #92 and `docs/PERSISTENCE.md` give for that save being fire-and-forget, which cite the interval autosave as the durability mechanism. Removing this line restores the defect with `tsc` clean and every test green, which is why it is asserted here rather than left to a type.',
  },
  {
    what: 'the browser key/value store is the one the scene is given',
    source: 'keyValueStore: resolveBrowserKeyValueStore()',
    reason:
      'Issue #199. `WorldSceneOptions.keyValueStore` is required, so `tsc` guarantees *a* store is passed -- but not which one, and not that the resolver is used at all. A `main.ts` that passed `globalThis.localStorage` directly would compile and would reintroduce the blank page on a browser that blocks site data, because reaching for the property is itself a throwing operation. `resolveBrowserKeyValueStore()` is the only reach that guards both the access and a first read.',
  },
  {
    what: 'the page localizer carries the complete default locale',
    source: 'catalogs: [defaultMessageCatalogEn]',
    reason:
      'Issue #229. ADR 0011: "Only the default locale is bundled -- it must be **complete** so the game always has text offline." It was not. This localizer was built from `defaultLocaleEnCatalog`, which is `src/content/`\'s half, while the trusted-services layer contributes twelve strings of its own (product names, save-slot counts, entitlement notices, challenge results, the telemetry consent prompt) that reach the page only through `defaultMessageCatalogEn`. Worse than an ordinary gap, because `tests/foundation/localization-key-completeness.test.ts` resolves every declared key against `defaultMessageCatalogEn` -- so the gate proving completeness was proving it of a catalog the application did not use, and `src/services/entitlements/products.ts`\'s `nameKey: \'product.save-slots.plus-5.name\'` passes that gate while the running page would paint the raw key. Measured: reverting this line leaves `tsc` clean and all 1,589 tests green.',
  },
  {
    what: 'the save panel is handed the page\'s localizer',
    source: 'new SavePanel(controller, hud.asideSlot, localizer)',
    reason:
      'Issue #208. The panel used to default to a localizer of its own over the same catalog -- equivalent while `en` is the only locale, and not equivalent the moment a second ships, when a panel holding its own default-locale localizer would keep rendering English while the rest of the interface changed language. The parameter is required now, so `tsc` guarantees *a* localizer is passed; it cannot guarantee it is the same instance the HUD uses, and re-adding a default would compile. Measured: with the default restored and this line intact the boundary manifest stays green and `tsc` is clean, because an unused default is dead code rather than the defect -- the defect was the composition root not handing one over, which is what this entry pins. The pinned call reads `hud.asideSlot` since #149, because `bootPersistence` now takes the whole `HudHandle` -- it needs the HUD\'s standing notice as well as its slot. The wiring this entry exists for, the third argument, is untouched.',
  },
  {
    what: 'each session gets a simulation worker of its own',
    source: 'new WorkerPerSessionHost(workers, {',
    reason:
      'Issue #149. `SimulationWorkerStateMachine` accepts one `simulation/initialize` and answers every later one with `already-initialized`, so a page that builds one worker and drives it with a bare `WorkerSessionHost` -- which is what this file did -- can start exactly one session, and every load after the first fails with no way forward but a page reload. Both components are correct in isolation and both have their own green tests; the defect was only ever in the composition, which is what this list is for. `tsc` cannot catch the revert either: `WorkerSessionHost` and `WorkerPerSessionHost` both satisfy `SessionRuntimeHost`, so swapping one for the other compiles. The HUD half of the same wiring -- the `onWorkerAvailability` callback that raises #82\'s notice when a *later* worker cannot be constructed -- is asserted in `tests/browser/app-shell.spec.ts`, where a real `Worker` can actually be blocked.',
  },
  {
    what: 'the lifecycle save handler is attached to the controller',
    source: 'new LifecycleSaveHandler(controller).attach()',
    reason:
      'Issue #92. A handler that is constructed and never attached registers no listener, and its unit tests -- which dispatch at an injected target -- pass either way. `tests/browser/lifecycle-save.spec.ts` drives a real navigation and would catch it, but only in the browser job; this catches it in `pnpm test`. Constructing it without `.attach()` is a single deleted call.',
  },
];

const source = stripComments(readFileSync(MAIN_PATH, 'utf8'));

describe('the composition root still connects what only it can connect', () => {
  it('reads a real composition root, so the assertions below cannot pass vacuously', () => {
    // The failure this guards is a moved or renamed entry point leaving every
    // assertion below matching against an empty string -- which reads exactly
    // like compliance. Both a size floor and a landmark, because a file that
    // was emptied would pass a landmark check on its own.
    expect(source.length).toBeGreaterThan(2_000);
    expect(source).toContain('function mountInterface');
    expect(source).toContain('bootPersistence');
    // And the stripper left code behind rather than blanking the file.
    expect(source).toContain('document.getElementById');
  });

  it.each(REQUIRED_WIRINGS.map((wiring) => [wiring.what, wiring] as const))(
    'wires %s',
    (_what, wiring: RequiredWiring) => {
      expect(
        source,
        `src/main.ts no longer wires ${wiring.what}. ${wiring.reason} If the removal is deliberate, delete this entry in the same change and say what replaced it.`,
      ).toContain(wiring.source);
    },
  );

  it('gives every entry a reason naming the defect it prevents', () => {
    // A list of bare call signatures would record what is wired and lose the
    // only thing that makes it safe to edit: why each one is worth a gate.
    for (const wiring of REQUIRED_WIRINGS) {
      expect(wiring.reason.trim().length, `${wiring.what} needs a reason`).toBeGreaterThan(120);
      expect(wiring.reason, `${wiring.what} should name its issue`).toMatch(/#\d+/u);
    }
  });
});
