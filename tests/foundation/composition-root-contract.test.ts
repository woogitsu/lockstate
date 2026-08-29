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
 * actually happened, or -- for the pair added by #261 -- a seam whose deletion
 * was **measured** to be invisible while it was being built, which is the same
 * evidence the three defects above produced after the fact. A wiring nobody
 * has broken and nothing can silently break does not need a line here, and
 * filling this list with every call in `main.ts` would make it a second copy
 * of the file that nobody reads.
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
    what: 'the worker\'s refusals reach the HUD\'s alerts list',
    source: 'const alerts = hudAlertsFromWorkerMessage(message, viewModel.alerts);',
    reason:
      'Issue #261, and the exact shape this list exists for: a seam that is correct, fully covered, and joined to nothing. `HudViewModel.alerts` -- the list, the severity badges, the folding section, the empty-state row and the insertion ordering #209 measured in a real browser -- is fully implemented, and between #220 and #261 **nothing assigned to it**: this file wrote `clock` and `counts`, and the only assignment anywhere in `src/` was the literal `[]` in `EMPTY_HUD_VIEW_MODEL` (#220 moved the one message that had ever been routed there to `.hud__unavailable`). So a build order the simulation refused (`state: \'failed\'`, `failReason: \'out-of-bounds\'`) reached the main thread and was dropped, with no ghost drawn and no refusal line raised, because the refusal line answers a rejected *command* and this command was queued. `hudAlertsFromWorkerMessage` is pure and has its own unit tests either way, so deleting this one line restores the defect exactly with `tsc` clean and the suite green -- which is the mutation this entry kills. The pinned call gained its second argument in #187: the list has two producers now -- a refusal, and an uncorrelated `protocol/error` that nothing else on this thread reads -- and passing `viewModel.alerts` is what stops a status-counts publication, which arrives up to twice a second, from painting over a fault row within 500 ms. Dropping the argument compiles, because the parameter defaults to `[]`.',
  },
  {
    what: 'the worker\'s refusals reach the band the player can actually see',
    source: 'const refusal = hudRefusalFromWorkerMessage(message);',
    reason:
      'Issue #220, made structural. The line above it joins the refusal to the alerts *list*, and that list is on screen at no viewport by default: `hud.css` drops `.hud__corner` at 720px and below, and the alerts section starts folded (`INITIAL_HUD_SHELL_STATE`) so the row is `offsetParent === null` with a 0x0 box even at 1280x800. #220 measured exactly that and moved one sentence out; every refusal the worker decided after accepting a command went on arriving in the folded region, including ADR 0028 phase 3\'s object removal. This line is the second reading of the same record, for `HudViewModel.refusal` and `.hud__refusal`. `hudRefusalFromWorkerMessage` is pure and unit-tested either way and `HudViewModel.refusal` is optional, so deleting this one line leaves `tsc` clean and every unit test green while the sentence goes back to being invisible -- which is the mutation this entry kills. The browser half is `tests/browser/app-shell.spec.ts` and `tests/browser/ui-shell.spec.ts`, which measure the band\'s box at 375x812 and 1280x800 with the fold left shut.',
  },
  {
    what: 'the world\'s undo keys to the renderer',
    source: '{ buildTool, editHistory: buildTool }',
    reason:
      'Issue #261. `WorldSceneOptions.editHistory` is optional -- correctly, since a page with no worker builds no tool and a world with no undo is a coherent state -- so `tsc` cannot say that the running application passes one, and the scene reports an undo to nobody without it. `KeyZ` then does nothing, which is the dead key #200 spent an issue on. Measured while the seam was built: with `editHistory: buildTool` deleted, `tsc` is clean and all 1,780 tests pass, because every other test of this feature drives a harness that constructs its own scene. The one production `new WorldScene(...)` is here.',
  },
  {
    what: 'the world\'s undo keys to the HUD, so a refused undo is reported',
    source: '{ worldBuild: tool, editHistory: tool }',
    reason:
      'Issue #261, and the other half of the same seam. The key reaches the HUD rather than the command sender so that a refusal paints the refusal line instead of a `console.warn` -- the defect #225 removed from the build drag. `MountHudOptions.editHistory` is optional, so deleting this argument compiles, and the HUD then registers no sink: `BuildTool.undo()` drops the request and the player gets silence from a key that is bound. Measured: with `editHistory: tool` deleted, `tsc` is clean and all 1,780 tests pass, because `tests/browser/ui-shell.spec.ts` mounts the HUD with a source of its own.',
  },
  {
    what: 'the telemetry pump is started, so the sink ever flushes',
    source: 'pipeline.startPump(',
    reason:
      'Issues #36 and #446, and the same shape as #146 exactly. `BatchingTelemetrySink` is deliberately timer-free -- its own header says "the host calls `pump(now)` from its own idle or interval orchestration" -- and for the whole life of the subsystem no host did, so nothing ever flushed and `git log --all -S "recorder.pump"` was empty. `startTelemetryPump` has its own unit tests over an injected scheduler and they pass whether or not anything calls it; the browser primitive it needs (`requestIdleCallback`) exists only here. Deleting this call leaves `tsc` clean and every test green while restoring a sink that queues forever and sends nothing, which is precisely the state ADR 0044 recorded.',
  },
  {
    what: 'the telemetry consent prompt is mounted when there is somewhere to send',
    source: 'createTelemetryConsentPrompt({',
    reason:
      'Issue #36, and the defect ADR 0044 called the clearest single statement of what was wrong: the four `telemetry.consent.*` strings shipped inside the bundle through `defaultMessageCatalogEn` while nothing rendered them, so "a player downloads the consent prompt for a telemetry system that cannot send". `localization-key-completeness` proves those keys resolve and would keep proving it with nothing on screen; `createTelemetryConsentPrompt` is browser-only code no headless test executes. Deleting this call leaves `tsc` clean and the suite green and returns the keys to being text no surface reaches -- and, worse than before, leaves a build that has an ingestion destination configured collecting nothing while never asking, because the gate defaults closed. Guarded by `telemetry.enabled` on purpose: with no destination configured there is nothing to consent to and the prompt must not appear.',
  },
  {
    what: 'the page\'s unhandled errors reach the telemetry recorder',
    source: "crashReporter.reportUnhandledError(event.error ?? event.message, 'page-error')",
    reason:
      'Issues #36 and #446. Between the pipeline landing and this line, `git grep -lI "recorder\\.\\(record\\|recordError\\)" -- src/ | grep -v "src/services/telemetry/"` returned nothing: consent, admission, batching, sampling, redaction and a transport, and **not one event produced anywhere**. `createCrashReporter` has its own unit tests over an injected recorder and they pass whether or not a listener calls it, and a listener is browser-only code no headless test executes -- which is exactly the shape of #146 and #261. The registration must also stay near the top of the file: a module-scope throw is reported to whatever is listening at the moment it happens, so a listener registered after the worker, the scene and the HUD cannot see the boot crash ADR 0010 calls the one a developer cannot reproduce. Measured while this was built: deleting this line and the three below leaves `tsc` clean and 427 tests across `tests/foundation/` and the telemetry and boundary units green.',
  },
  {
    what: 'an unhandled promise rejection reaches the telemetry recorder',
    source: "crashReporter.reportUnhandledError(event.reason, 'page-rejection')",
    reason:
      'Issues #36 and #446, and the half that is easiest to lose. Almost everything this page does after first paint is a promise -- `bootPersistence`, every save, every worker request -- so a rejection is the *likelier* crash shape here, and it reaches a different browser event with a different payload property than the line above. The only `unhandledrejection` listener anywhere in `src/` before this change was `src/simulation/worker/worker.ts`, which routes into the worker protocol and never into telemetry, so deleting this line returns the main thread to reporting no rejection at all while `tsc` stays clean and the suite stays green.',
  },
  {
    what: 'a simulation worker that will not start at boot is recorded as a diagnostic',
    source: "crashReporter?.reportWorkerLoss('boot', error)",
    reason:
      'Issues #36, #82 and #446. `diagnostic.worker-terminated` is registered with the purpose "detect simulation worker loss, which is invisible to the player until state stops advancing", and nothing produced it. The producer binds to the catch that already raises #82\'s player-facing notice rather than being pushed into `SimulationClient` or `WorkerPerSessionHost`, because `SimulationClient` records one module over that a failure belongs "on the route the protocol already has rather than through a channel of this class\'s own" -- and a telemetry import under `src/simulation/` is refused outright by `tests/unit/services-layer-boundaries.test.ts`. Deleting it is invisible: `console.error` beside it keeps the log line, so nothing else changes.',
  },
  {
    what: 'a simulation worker lost after boot is recorded as a diagnostic',
    source: "if (!available) crashReporter?.reportWorkerLoss('session')",
    reason:
      'Issues #36, #149 and #446, and the case the boot binding cannot cover. Since a session boundary is a worker boundary, construction can fail long after first paint, and `WorkerPerSessionHost` reports it through `onWorkerAvailability(false)` -- a route this file already reads for the HUD notice. That callback carries no thrown value, which is why the report carries no error class rather than a fabricated one. Deleting this line leaves the HUD notice intact and the diagnostic silent, with `tsc` clean and every test green, which is precisely the state that made this whole list necessary.',
  },
  {
    what: 'the staffing warning has a reader at all',
    source: 'new StaffCoverageReader(client)',
    reason:
      'ADR 0048 consequence 1. The Staff panel\'s coverage block is the only surface for the requirement `DeploymentSystem` scales with occupancy -- one guard per eight prisoners standing on owned land -- and it is a *pulled* field: `HudViewModel.staffCoverage` is optional and the panel draws no box until something answers, so a page that constructs no reader shows exactly what the repository showed before this change, which is nothing. `StaffCoverageReader` has its own unit tests over a fake channel and `staffCoverageFromProjection` is pure, so both stay green with this line gone; `hud/staff` had been catalogued and unread since #104 shipped it, which is the state deleting this line restores. Measured: with the construction replaced by `undefined`, `tsc` is clean and the unit and integration tests for this feature all pass.',
  },
  {
    what: 'opening the Security tab asks for the coverage figures at once',
    source: "if (activeTab === 'security') refreshStaffCoverage();",
    reason:
      'ADR 0048 consequence 1 (issue #442), and the half a player notices. Every other reader on #104\'s channel is asked twice -- once on arriving at its tab and once per counts publication -- and the arrival ask is what stops a block being empty for up to 500ms. It matters more here than for the readouts beside it because this one is a *warning*: a player who opened the Security tab because they suspected they were short would be shown nothing at all for half a second, which reads as "no problem" rather than as "not loaded yet". Deleting it leaves the cadence ask intact, so nothing fails and the block merely arrives late -- exactly the class of silent loss this list exists for.',
  },
  {
    what: 'the coverage figures are refreshed on the counts cadence, not only on arrival',
    source: 'refreshHeldGuards();\n      refreshStaffRoster();\n      refreshStaffCoverage();',
    reason:
      'ADR 0048 consequence 1 (issue #442), and the half a player does *not* notice, which is why it is pinned in context rather than by its own name. `refreshStaffCoverage()` appears twice in this file and `toContain` cannot tell the two apart, so this entry names the cadence call by the line above it. Without it the block is painted once when the Security tab opens and never again: a player who leaves that tab showing while the ninth prisoner is admitted keeps reading a green "Covered" over a prison that has since outgrown its guards, which is worse than no readout. The whitespace is safe to pin because this repository has no formatter -- `agrees with package.json about whether a linter or formatter exists`, below, is the gate that keeps that true. Deleting the call leaves `tsc` clean and every test green. **Issue #533 put `refreshStaffRoster()` between the two lines this entry pins**, which is why the pinned text names three calls rather than two: the roster block feeding `DismissStaff` lives on the same tab and is refreshed on the same cadence for the same reason, and pinning it here is what stops it being dropped back to arrival-only.',
  },
  {
    what: 'the Build catalogue asks the simulation which rows sit on an edge',
    source: 'occupiesEdge: occupiesTileEdge(definition)',
    reason:
      "Issue #531. This line read `occupiesEdge: definition.category === 'wall'` -- a second copy of a rule the simulation already owns, and `occupiesTileEdge`'s own comment had been amended to record that the two answers disagreed. Measured over the whole registry, `door-wooden` is the only row they disagree about, and it is also the only row that reaches `place-build-order` while answering `false`: it is `category: 'object'` naming a `placesDoor`, so it writes `DOOR_EDGE_NUMERIC_ID` onto an edge while this row told the HUD it sat on none. The Build panel therefore hid its edge chooser for a door and submitted the panel's retained edge regardless, so a door typed into the coordinate form took whichever edge had last been chosen for a wall rather than one the player picked. Restoring the re-derivation leaves `tsc` clean and every unit test green, because nothing headless imports this file and `occupiesTileEdge`'s own tests pass either way, which is the mutation this entry kills. The behaviour is measured in `tests/browser/ui-shell.spec.ts` (\"shows the edge chooser for a door\"); this catches it in `pnpm test`.",
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
