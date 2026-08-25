import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  describeConstructionSite,
  describeDependency,
  reportConstructionSites,
  findCrossTreeDependencies,
  findImports,
  reportCrossTreeViolations,
  type CrossTreeAllowance,
  type ScannedSource,
} from '../helpers/module-boundaries';

/**
 * `src/ui/*.ts` -- the top-level modules of the UI tree -- was the second of
 * the two trees under `src/` that no boundary test reached (#206).
 * `tests/unit/ui-hud-messages.test.ts` collects from `src/ui/hud/**` and
 * `src/ui/primitives/**` only, so `save-panel.ts`, `simulation-commands.ts`,
 * `build-tool.ts`, `simulation-clock.ts` and `simulation-counts.ts` were
 * checked by nothing. `docs/TESTING.md` states that gate's scope precisely and
 * correctly; what no document said is that the rest of the tree was ungated.
 *
 * There were five such modules when this file was written (869 lines);
 * `save-panel-messages.ts` (#208) made six, `brand-badge.ts` with
 * `brand-messages.ts` made eight, `simulation-alerts.ts` (#261) made nine, and
 * `simulation-projections.ts` (#104) makes ten. The vacuity guard below is the
 * list a new one has to be added to.
 *
 * ## Why this is a separate file, and not a widening of the HUD gate
 *
 * `tests/unit/ui-hud-messages.test.ts` already enforces `AGENTS.md` boundary 1
 * for `src/ui/hud/**` and `src/ui/primitives/**` in its strongest form: those
 * subtrees may not import `src/simulation/**` at all. That rule is not
 * reimplemented here, and the file sets are disjoint -- this file collects only
 * the top level. `covers the whole of src/ui/ between the two gates` below is
 * what keeps the pair exhaustive, so a new subdirectory under `src/ui/` cannot
 * land inside neither.
 *
 * ## Why the rule here is a manifest and not a prohibition
 *
 * The top level is the composition layer `AGENTS.md` boundary 3 puts on the
 * main thread ("the main thread owns rendering, browser UI and input
 * orchestration"), and **five of the six** import `src/simulation/**`
 * -- legitimately. (#206 says "three of them"; measured, it was five of the
 * five modules that existed then: every one named at least one simulation
 * type. `save-panel-messages.ts` is the sixth and names none: it is a frozen
 * registry of message keys. Two of the five, `build-tool.ts`
 * and `simulation-commands.ts`, are the orchestration modules the issue meant,
 * and `build-tool.ts:9-15` explains at length why it is the one module allowed
 * to know both halves.) So "must not import the simulation" would be false
 * here, and asserting a false rule with five exemptions produces the list
 * nobody reads that `src/content/validate-catalog.ts` argues against.
 *
 * What was missing is narrower and real: **the rule and its exception existed
 * only in prose.** Nothing distinguished "orchestration, allowed" from "a
 * panel that quietly grew a simulation import", and the composition root is
 * where such an import is easiest to justify to yourself. So the manifest
 * records, per module, which layers it may know and *how* -- as erased types,
 * or as code it can run. That distinction is the one that matters: a module
 * permitted to name `RestoredScope` gaining the ability to call
 * `restoreSimulationRuntime` is the step that turns a view into a second
 * source of truth, and it is one line of diff. All three directions fail:
 * an unrecorded dependency, an entry whose dependency is gone, and an entry
 * whose kind has drifted.
 *
 * Two rules are asserted outright rather than through the manifest, because
 * both are true of the whole tree today with nothing to forgive: no module
 * here imports a package, and no module here builds a live simulation. The
 * second is `AGENTS.md` boundary 1 in the form #206 found unguarded in the
 * renderer; the forms live in `tests/helpers/module-boundaries.ts` and are
 * checked against the declarations `src/simulation/**` really exports.
 */

const UI_ROOT = join(__dirname, '../../src/ui');
const OWN_TREE = 'ui';

/** Subtrees of `src/ui/` that `tests/unit/ui-hud-messages.test.ts` already collects and gates. */
const GATED_ELSEWHERE = ['hud', 'primitives'] as const;

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

const scan = (path: string): ScannedSource => ({
  file: posix.join('src', OWN_TREE, relative(UI_ROOT, path).split(sep).join(posix.sep)),
  source: readFileSync(path, 'utf8'),
});

const allUiFiles: readonly ScannedSource[] = collectTypeScriptFiles(UI_ROOT).map(scan);
const subtreeOf = ({ file }: ScannedSource): string | undefined => {
  const segments = file.split(posix.sep);
  return segments.length > 3 ? segments[2] : undefined;
};

/** The top level only: `src/ui/*.ts`. */
const orchestrationFiles = allUiFiles.filter((entry) => subtreeOf(entry) === undefined);

/**
 * Every layer outside `src/ui/` that a top-level UI module is allowed to know,
 * and how.
 *
 * Sixteen entries, which is the whole cross-layer dependency surface of the
 * composition tier. Written down rather than inferred, because the point of
 * the list is that it converts "we know `build-tool.ts` is special" from
 * folklore into a line CI reads -- and because a reviewer can audit sixteen
 * facts. The count is the list's own length and is corrected whenever an
 * entry is added or removed: it read "ten" while the list held fourteen, and
 * the last change to it removed `build-tool.ts -> simulation`, which the
 * `stale` check below failed on before anybody looked (issue #225 -- the tool
 * stopped assembling `PlaceBuildOrder` commands and now reports the gesture to
 * the HUD, so it names no simulation type at all).
 *
 * Each `kind` is measured, not chosen: `type-only` means every import of that
 * layer from that file is erased at compile time, so the module cannot run any
 * of that layer's code. `value` means at least one import carries runtime
 * code, and the reason then has to say which and why.
 *
 * A reason states what is verifiably true today and is deliberately not a
 * plan.
 */
const ALLOWED_FOREIGN_TREES: readonly CrossTreeAllowance[] = [
  {
    file: 'src/ui/build-tool.ts',
    tree: 'rendering',
    kind: 'type-only',
    reason:
      'Type-only: `BuildToolPort` and `EdgeTarget` from `src/rendering/build/edge-picking`. `BuildToolPort` is the port the renderer *offers* -- the scene reports the edges a gesture covered and this module turns them into orders -- so the dependency direction is UI-onto-a-renderer-contract, not UI-into-renderer-internals, and it is erased. This is the module `AGENTS.md` boundary 3 describes: it is deliberately the one place that knows both halves, and its own header says so. A value import from `src/rendering/` would mean the orchestrator had started calling into the renderer rather than being handed its reports.',
  },
  {
    file: 'src/ui/save-panel.ts',
    tree: 'persistence',
    kind: 'type-only',
    reason:
      'Type-only: `SaveResult`, `SaveImportResult`, `PrisonSlotMetadata`, `SaveEnvelope`, `ActiveSession` and `SessionLoadOutcome`. The save panel renders the outcomes the persistence layer reports and calls nothing itself -- the host wires the actions. `SaveImportResult` arrived with the Import control (#287) and is the same kind of dependency as the rest: the panel names what an import reported, and the decoding, migration and checksum verification behind it all happen in `src/persistence/**`. This is the dependency the HUD proper keeps out by laying out the host panel through `asideSlot` and never rendering into or reading it (`HudHandle.asideSlot` in `src/ui/hud/hud.ts` states the rule and names both layers), which is exactly why the panel may type-import persistence while `src/ui/hud/**` may not.',
  },
  {
    file: 'src/ui/save-panel.ts',
    tree: 'simulation',
    kind: 'type-only',
    reason:
      'Type-only: `RestoredScope` from `src/simulation/runtime/restore-session`, the record saying which subsystems a load actually restored, which the panel reports to the player. The same module exports `restoreSimulationRuntime`, so this is the entry whose `kind` is load-bearing: naming the scope type is a view concern, and calling the factory next to it would make the save panel the owner of a live simulation. The manifest fails on that change rather than after it.',
  },
  {
    file: 'src/ui/save-panel.ts',
    tree: 'content',
    kind: 'type-only',
    reason:
      'Type-only: `LocalizationKey`, to type the panel\'s `SavePanelLocalizer` port and its message-key registry. **This entry read `value` until the localizer was made required**, because `DEFAULT_LOCALE` was a runtime constant read by the fallback localizer the panel built for itself -- and the previous reason predicted the collapse in those words: "it becomes `type-only` the moment `src/main.ts` passes in the `Localizer` it already builds for the HUD". That happened, and this gate is what said so: the manifest failed with "value -> type-only means the entry overstates what the module needs and should be tightened" before anybody looked. Erased now, so no content code runs on the panel\'s account.',
  },
  {
    file: 'src/ui/save-panel.ts',
    tree: 'services',
    kind: 'type-only',
    reason:
      'Type-only: `MessageParameters`, for the `format(key, parameters)` signature of the `SavePanelLocalizer` port. **Also `value` until the localizer was made required** -- `Localizer` and `defaultMessageCatalogEn` were imported solely by the fallback the panel used to build, and the previous reason said "both go away with it". They did. The panel still resolves its own message keys at the moment it writes to the DOM (ADR 0011, #208), which is the synchronous localization call `docs/ARCHITECTURE.md` records as this layer\'s deliberate exception -- but it does so through an instance the composition root hands it, so it needs no value from this layer. A `value` import reappearing here would mean the panel had started constructing a localizer again.',
  },
  {
    file: 'src/ui/save-panel-messages.ts',
    tree: 'content',
    kind: 'type-only',
    reason:
      'Type-only: `LocalizationKey` from `src/content/localization`. The module is a frozen registry of the save panel\'s message keys and nothing else -- the shape `src/ui/hud/messages.ts` already uses for the HUD -- and naming the key type is what lets `satisfies Readonly<Record<string, LocalizationKey>>` check every entry at compile time. Erased, so no content code runs because of it, and it names no other layer at all.',
  },
  {
    file: 'src/ui/simulation-clock.ts',
    tree: 'simulation',
    kind: 'value',
    reason:
      'Value: `projectClockPosition` from `src/simulation/presentation/clock-projection`, plus the `WorkerToMainMessage` type. The function is a pure projection from a tick count to a day/hour position and lives on the simulation side deliberately, for the reason `src/rendering/world/world-view.ts:151-166` gives about tile ownership: a display that reimplemented the calendar could disagree with the simulation about what day it is. Calling it moves no state -- this module holds a cached echo of what the worker last reported and nothing else.',
  },
  {
    file: 'src/ui/simulation-commands.ts',
    tree: 'simulation',
    kind: 'value',
    reason:
      'Value: `packCommand` (the protocol encoder), `SIMULATION_PROTOCOL_VERSION` and `SESSION_SNAPSHOT_SCHEMA_ID`, plus protocol and clock types. This is the orchestration half of `AGENTS.md` boundary 3 -- it turns a player action on this thread into a message on the worker. Everything it imports is protocol vocabulary: an encoder, a version constant and a schema id. It owns no simulation state, holds no authoritative copy of anything, and its own header states that every value it tracks is a cached echo of something the worker already told it. It constructs no runtime, which the construction assertion below checks rather than trusts.',
  },
  {
    file: 'src/ui/simulation-alerts.ts',
    tree: 'content',
    kind: 'type-only',
    reason:
      'Type-only: `LocalizationKey` from `src/content/localization`, so `satisfies`/`Record` can check at compile time that every refusal reason has a message key. The same use `save-panel-messages.ts` and `brand-messages.ts` already make of it; erased, so no content code runs because of it.',
  },
  {
    file: 'src/ui/simulation-alerts.ts',
    tree: 'simulation',
    kind: 'type-only',
    reason:
      'Type-only: `RefusalReason` and `WorkerToMainMessage` from `src/simulation/protocol/types`. It reads the refusal off a status-counts publication into a HUD alert row and nothing else -- the same shape as `simulation-counts.ts` beside it, and for the same reason: the HUD may not import the simulation (`AGENTS.md` boundary 1), so the module that has to know both a protocol message and a view model sits outside `src/ui/hud/`. No simulation code runs because of it, and the `Record` over `RefusalReason` is what makes a reason added to the protocol fail to compile until it has something to say (#261).',
  },
  {
    file: 'src/ui/simulation-counts.ts',
    tree: 'simulation',
    kind: 'type-only',
    reason:
      'Type-only: `WorkerToMainMessage` from `src/simulation/protocol/types`. It reads counts off snapshot messages into a HUD view model and nothing else; 57 lines, no simulation code runs because of it.',
  },
  {
    file: 'src/ui/simulation-projections.ts',
    tree: 'simulation',
    kind: 'value',
    reason:
      'Value: `SIMULATION_PROTOCOL_VERSION` from `src/simulation/protocol/types`, plus the `MainToWorkerMessage`, `WorkerToMainMessage`, `ProjectionId` and `ProjectionTarget` types. It is the only module here that *sends* on the projection channel, and everything it imports is protocol vocabulary -- one version constant and four type names -- which is the same dependency `simulation-commands.ts` beside it carries and for the same reason: turning a panel\'s request into a message on the worker is the orchestration half of `AGENTS.md` boundary 3. It owns no simulation state and caches nothing, deliberately: a cache here would be a second, stale copy of the prison on this thread, which is the boundary the whole projection channel exists to keep (#104). It constructs no runtime, which the construction assertion below checks rather than trusts.',
  },
  {
    file: 'src/ui/brand-badge.ts',
    tree: 'content',
    kind: 'type-only',
    reason:
      'Type-only: `LocalizationKey` from `src/content/localization`, to type its `BrandLocalizer` port. The same erased naming-of-a-key-type every other UI module here does; no content code runs because of it.',
  },
  {
    file: 'src/ui/brand-badge.ts',
    tree: 'services',
    kind: 'type-only',
    reason:
      'Type-only: `MessageParameters` from `src/services/localization/format`, for the `format(key, parameters)` signature of its port. **Narrower than the save panel\'s entry on purpose, and the difference is the point of recording the kind:** this module takes its localizer by construction from `src/main.ts` and builds none of its own, so it needs no value from that layer. The save panel\'s two `value` entries exist only because it still defaults a localizer it should be handed. A `value` import appearing here would mean this badge had started constructing a second localizer, which is the thing that entry is a standing reminder to undo.',
  },
  {
    file: 'src/ui/brand-badge.ts',
    tree: 'shared',
    kind: 'value',
    reason:
      'Value: `BUILD_IDENTITY` from `src/shared/build-identity`, plus the `BuildIdentity` type. The first dependency on `src/shared/` from this tier, and the one layer whose value import is not a seam to be closed later: the module is nine lines of compile-time constant with no imports of its own, no I/O and no DOM, and reading it is the whole point of the badge. It is a `value` and not `type-only` because a constant cannot be erased. Note that the badge takes the identity as an *option* and only defaults to this constant -- which is why the module is drivable from a test with no `define` at all.',
  },
  {
    file: 'src/ui/brand-messages.ts',
    tree: 'content',
    kind: 'type-only',
    reason:
      'Type-only: `LocalizationKey` from `src/content/localization`. A frozen registry of the badge\'s message keys and nothing else, in the shape `src/ui/hud/messages.ts` and `src/ui/save-panel-messages.ts` both use; naming the key type is what lets `satisfies Readonly<Record<string, LocalizationKey>>` check every entry at compile time. Erased, and it names no other layer.',
  },
  {
    file: 'src/ui/room-tool.ts',
    tree: 'rendering',
    kind: 'type-only',
    reason:
      'Type-only: `RoomToolPort` and `TileRect` from `src/rendering/build/area-picking`. The exact shape of `build-tool.ts`\'s entry above and the same argument one gesture over: `RoomToolPort` is a port the renderer *offers* -- the scene reports the rectangle of tiles a drag covered and this module turns it into something the HUD can dispatch -- so the direction is UI-onto-a-renderer-contract rather than UI-into-renderer-internals, and it is erased. It is a second module rather than more methods on `BuildTool` because the two ports carry different shapes and the room tool carries a removal mode; `src/ui/room-tool.ts`\'s header states that rule against `BuildTool`\'s own. A value import here would mean the orchestrator had started calling into the renderer, which is what that entry says too.',
  },
  {
    file: 'src/ui/simulation-zoning.ts',
    tree: 'simulation',
    kind: 'type-only',
    reason:
      'Type-only: `WorkerToMainMessage` from `src/simulation/protocol/types`. The fourth of the translators outside `src/ui/hud/`, the same shape as `simulation-counts.ts` and `simulation-alerts.ts` beside it and for the same reason: the HUD may not import the simulation (`AGENTS.md` boundary 1), so the module that has to know both a protocol message and a view model sits outside `src/ui/hud/`. It reads what the last accepted zoning said about itself off a status-counts publication and returns three plain fields; no simulation code runs because of it, and unlike the other three it names no `content` dependency at all, because it maps no id onto a message key -- the Rooms panel decides which sentence the enum pair deserves.',
  },
];

const dependencies = findCrossTreeDependencies(orchestrationFiles, OWN_TREE);
const report = reportCrossTreeViolations(dependencies, ALLOWED_FOREIGN_TREES);

describe('UI orchestration boundaries', () => {
  it('finds the top-level UI sources it is meant to be checking', () => {
    // Vacuity guard. A filter that stopped matching would leave every rule
    // below asserting about an empty list, which reads exactly like
    // compliance -- the failure mode this whole family of tests exists to
    // avoid, and the one `rendering-module-boundaries.test.ts` and
    // `ui-hud-messages.test.ts` both carry a guard for.
    expect(orchestrationFiles.map(({ file }) => file)).toEqual([
      'src/ui/brand-badge.ts',
      'src/ui/brand-messages.ts',
      'src/ui/build-tool.ts',
      'src/ui/room-tool.ts',
      'src/ui/save-panel-messages.ts',
      'src/ui/save-panel.ts',
      'src/ui/simulation-alerts.ts',
      'src/ui/simulation-clock.ts',
      'src/ui/simulation-commands.ts',
      'src/ui/simulation-counts.ts',
      'src/ui/simulation-projections.ts',
      'src/ui/simulation-zoning.ts',
    ]);
    // And the import scanner really is reading them.
    expect(orchestrationFiles.flatMap(({ source }) => findImports(source)).length).toBeGreaterThan(15);
  });

  it('covers the whole of src/ui/ between the two gates', () => {
    // The finding in #206 was not that a rule was wrong; it was that two
    // trees were outside every boundary test and no document said so. This is
    // what stops that recurring under a new name: a `src/ui/<something>/`
    // subtree that neither this file nor `ui-hud-messages.test.ts` collects
    // fails here, rather than being discovered by the next audit.
    const ungated = allUiFiles
      .map((entry) => ({ file: entry.file, subtree: subtreeOf(entry) }))
      .filter((entry) => entry.subtree !== undefined && !GATED_ELSEWHERE.includes(entry.subtree as (typeof GATED_ELSEWHERE)[number]))
      .map((entry) => entry.file);
    expect(
      ungated,
      'these src/ui/ modules are in no boundary test: tests/unit/ui-hud-messages.test.ts collects src/ui/hud/** and src/ui/primitives/**, and this file collects the top level. Add the subtree to one of them',
    ).toEqual([]);

    // Non-vacuous in the other direction too: the two subtrees named above
    // must really exist and really be non-empty, or the exemption is empty
    // words. Their *rules* are asserted in `ui-hud-messages.test.ts`; only
    // their existence is asserted here.
    for (const subtree of GATED_ELSEWHERE) {
      expect(allUiFiles.filter((entry) => subtreeOf(entry) === subtree).length, `src/ui/${subtree}/ is empty or gone`).toBeGreaterThan(4);
    }
    expect(allUiFiles.length).toBe(orchestrationFiles.length + allUiFiles.filter((entry) => subtreeOf(entry) !== undefined).length);
  });

  it('imports no package, Phaser included', () => {
    // True of the whole tier today with nothing to forgive, so it is asserted
    // outright rather than through the manifest. The HUD's own gate makes the
    // same assertion for `src/ui/hud/**` and `src/ui/primitives/**`; this
    // covers the five modules that gate never sees.
    for (const { file, source } of orchestrationFiles) {
      const packages = findImports(source)
        .map((site) => site.specifier)
        .filter((specifier) => !specifier.startsWith('.'));
      expect(packages, `${file} now imports a package`).toEqual([]);
    }
  });

  it('depends on no layer outside src/ui/ that is not recorded with a reason', () => {
    expect(
      report.unlisted.map(describeDependency),
      'a top-level UI module now depends on a layer this manifest does not record. If that is orchestration AGENTS.md boundary 3 allows, add the entry with the reason and the measured kind; if it is a panel reaching past its view-model, remove the import',
    ).toEqual([]);
  });

  it('keeps its manifest honest in all three directions', () => {
    expect(
      report.stale.map((entry) => `${entry.file} -> src/${entry.tree}/`),
      'this dependency no longer exists: delete its entry in the same change, or the manifest becomes fiction',
    ).toEqual([]);
    expect(
      report.mismatched.map(
        (entry) => `${entry.allowance.file} -> src/${entry.allowance.tree}/ is recorded as ${entry.allowance.kind} but is now ${entry.actual}`,
      ),
      'the kind of this dependency has drifted. type-only -> value is the erosion that matters: the module stopped naming a type and started running that layer\'s code, which is one line of diff and the step that turns a view into a second source of truth. value -> type-only means the entry overstates what the module needs and should be tightened',
    ).toEqual([]);

    // The manifest accounts for every cross-layer dependency and nothing
    // more, so its length is the number a reviewer has to audit.
    expect(dependencies.length).toBe(ALLOWED_FOREIGN_TREES.length);
  });

  it('gives every manifest entry a real reason', () => {
    for (const entry of ALLOWED_FOREIGN_TREES) {
      expect(entry.reason.trim().length, `${entry.file} -> src/${entry.tree}/ needs a reason`).toBeGreaterThan(80);
    }
  });

  it('builds no simulation anywhere in src/ui/, which is AGENTS.md boundary 1', () => {
    // The whole tree, not only the top level: the HUD gate forbids any
    // simulation import from `src/ui/hud/**` and `src/ui/primitives/**` and so
    // already implies this for them, but a construction rule that stopped at
    // the tier boundary would have to be widened by whoever moved a module,
    // which is the maintenance a gate exists to remove.
    //
    // This is the rule whose renderer-side counterpart #206 found unable to
    // fire: `new SimulationRuntime` names an interface. The forms now include
    // the two factories that really build one, and
    // `tests/unit/module-boundary-rules.test.ts` checks each form against
    // what `src/simulation/**` exports.
    const construction = reportConstructionSites(allUiFiles);
    // Denominator first, for the reason the sibling gates state: a scan handed
    // an empty list reports no violations and reads exactly like compliance.
    expect(construction.scannedFiles).toBe(allUiFiles.length);
    expect(construction.scannedFiles).toBeGreaterThan(20);
    expect(
      construction.sites.map(describeConstructionSite),
      'a UI module now builds a live simulation. The main thread owns rendering, browser UI and input orchestration (AGENTS.md boundary 3); the simulation worker owns authoritative in-session game state (boundary 4). A runtime built here is a second, divergent simulation -- the reason src/main.ts gives, at `simulationWorkers`, for there being at most one worker at a time',
    ).toEqual([]);
  });
});
