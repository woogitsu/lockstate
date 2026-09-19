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
 * `simulation-projections.ts` (#104) makes ten, and `simulation-intake.ts` (#104's
 * third consumer) makes eleven. The vacuity guard below is the
 * list a new one has to be added to, and it has been added to since: the guard
 * enumerates every top-level module by name, so the count in this paragraph is
 * the one thing here that rots and the list below is what a reader should
 * count.
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
 * and `build-tool.ts:16-85` explains at length why it is the one module allowed
 * to know both halves.) So "must not import the simulation" would be false
 * here, and asserting a false rule with five exemptions produces the list
 * nobody reads that `tests/helpers/simulation-enum-source.ts` argues against.
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
 * One rule is asserted outright over the whole tree with nothing to forgive:
 * no module here builds a live simulation. The package rule used to be the
 * second, and is not any more -- `src/ui/account/account-preferences.ts`
 * imports `zod` to version a persisted record, so the tier-wide claim is now
 * a top-level claim plus one named exception. Both directions are left
 * standing rather than overwritten: the sentence was true of the whole tree
 * until the account subtree landed, and the exception is written down where
 * a reader looking for the old absolute will find it. The
 * second is `AGENTS.md` boundary 1 in the form #206 found unguarded in the
 * renderer; the forms live in `tests/helpers/module-boundaries.ts` and are
 * checked against the declarations `src/simulation/**` really exports.
 */

const UI_ROOT = join(__dirname, '../../src/ui');
const OWN_TREE = 'ui';

/** Subtrees of `src/ui/` that `tests/unit/ui-hud-messages.test.ts` already collects and gates. */
const GATED_ELSEWHERE = ['hud', 'primitives'] as const;

/**
 * Subtrees of `src/ui/` that *this* file collects and gates.
 *
 * `src/ui/account/**` is the client-side identity and save-list model ADR 0043
 * decides. It is not the HUD's, so `ui-hud-messages.test.ts` does not collect
 * it, and it is not top-level, so the orchestration manifest did not either --
 * which is exactly the hole the coverage gate below exists to catch, and it
 * caught this one on the integration run rather than in the next audit.
 */
const GATED_HERE = ['account'] as const;

const isSubtree = (subtree: string | undefined, list: readonly string[]): boolean =>
  subtree !== undefined && list.includes(subtree);

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

/** The subtrees this file gates, currently `src/ui/account/**`. */
const gatedHereFiles = allUiFiles.filter((entry) => isSubtree(subtreeOf(entry), GATED_HERE));

/** Everything this file is the boundary gate for. */
const gatedFiles = [...orchestrationFiles, ...gatedHereFiles];

/**
 * Every layer outside `src/ui/` that a top-level UI module is allowed to know,
 * and how.
 *
 * The whole cross-layer dependency surface of the tier this file gates.
 * Written down rather than inferred, because the point of the list is that it
 * converts "we know `build-tool.ts` is special" from folklore into a line CI
 * reads -- and because a reviewer can audit a finite set of facts.
 *
 * **This paragraph no longer states how many.** It has now rotted twice in the
 * same place: it read "ten" while the list held fourteen, and it read
 * "sixteen" while the list held twenty-eight. A tally written beside the thing
 * it counts is edited by nobody who adds to the list, which is
 * `docs/AGENT_WORKFLOW.md` §4's rule about counts, demonstrated on the very
 * file that narrates it. Derive it instead:
 * `node -e "const s=require('fs').readFileSync(F,'utf8'),a=s.slice(s.indexOf('const ALLOWED_FOREIGN_TREES'));console.log([...a.slice(0,a.indexOf('\n];')).matchAll(/file: '/g)].length)"`.
 *
 * The correction that *did* hold is kept because it is a different claim:
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
    kind: 'value',
    reason:
      '**This entry read `type-only` until #432**, and the one value it now names is `readableGenerationIds` from `src/persistence/local/generation-policy` -- the predicate saying which of a prison\'s retained generations this build can actually offer. A generation this build has refused as unreadable and kept for a build that can read it (#432) is still a record in `generationIds`, so the row\'s "N saves" count would silently include a save the player cannot load: a promise the code does not keep, which is `AGENTS.md`\'s fourth exclusion. The alternative to importing the predicate is restating the quarantine convention here, which would put a second definition of a persistence format in a view -- the same contamination `cloud-slot-availability.ts` records for the five-slot ladder, and the reason that entry is `value` too. What the old `type-only` kind was protecting is named and still true: `generation-policy.ts` imports nothing at all -- **that is the load-bearing fact of this entry, and it is the one that can go stale silently.** A `value` import is only as narrow as the module it names, so the moment `generation-policy.ts` gains an import of its own this reason is wrong and nothing here will say so: this gate compares kinds, not transitive reachability. Anyone adding an import to that module is adding it to this tier too, and should either not, or come back and rewrite this entry. A value import from `repository.ts`, `store.ts` or `save-schema.ts` would be the erosion this entry exists to catch, and would still fail review. The erased names are unchanged: `SaveResult`, `SaveImportResult`, `PrisonSlotMetadata`, `SaveEnvelope`, `ActiveSession` and `SessionLoadOutcome`. The save panel renders the outcomes the persistence layer reports and calls nothing itself -- the host wires the actions. `SaveImportResult` arrived with the Import control (#287) and is the same kind of dependency as the rest: the panel names what an import reported, and the decoding, migration and checksum verification behind it all happen in `src/persistence/**`. This is the dependency the HUD proper keeps out by laying out the host panel through `asideSlot` and never rendering into or reading it (`HudHandle.asideSlot` in `src/ui/hud/hud.ts` states the rule and names both layers), which is exactly why the panel may type-import persistence while `src/ui/hud/**` may not.',
  },
  {
    file: 'src/ui/affordability.ts',
    tree: 'simulation',
    kind: 'value',
    reason:
      "Value: `TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS` from `src/simulation/economy`, and nothing else -- one integer constant, used as a default argument. This module is the host's pre-flight on the two intents that cost money, and it exists because the comparison it makes lived inline in `src/main.ts`, which `vitest.config.ts` cannot reach at all (`environment: 'node'`, and that file touches `document`), so #703 ruling A silently made it wrong: it refused presses the simulation accepts. Importing the constant rather than restating `-2_500` is the point of the entry -- the host's echo and the treasury's own floor derive from one definition, which is the same argument `simulation-clock.ts` makes below about the calendar. It runs no simulation code, holds no state, constructs nothing and has no dependency on the runtime: a value import of `Treasury` itself, or of anything that could build one, would mean the interface had started keeping a second treasury instead of echoing the published balance, and that is the erosion this entry exists to catch.",
  },
  {
    file: 'src/ui/save-panel-delete.ts',
    tree: 'content',
    kind: 'type-only',
    reason:
      "Type-only: `LocalizationKey`, to type the message shape this module's three `describe*` functions return. It is `save-panel.ts`'s own content entry one module over and for the same reason -- these functions were extracted *out* of that file so `pnpm test` could reach them (`environment: 'node'` makes anything touching `document` unobservable, #445's argument), and an extraction that needed a wider dependency than the file it came from would be the wrong extraction. Erased, so no content code runs on this module's account.",
  },
  {
    file: 'src/ui/save-panel-delete.ts',
    tree: 'persistence',
    kind: 'type-only',
    reason:
      "Type-only: `RestoreOutcome` from `src/persistence/local/repository`, the four names an undo press can come back with (ADR 0114). It is here for `save-panel.ts`'s `SaveResult` reason -- this module maps a persistence outcome to a sentence, and the union is declared once, in the layer that produces it, so that `describeRestoreOutcome`'s exhaustive switch is what fails `tsc` the day a fifth outcome exists rather than a sentence silently going unwritten. Restating the four names here instead would put a second definition of a persistence contract in a view, which is the contamination `save-panel.ts`'s own `value` entry argues against at length. Erased, so this module still runs no persistence code and constructs no repository; a `value` import appearing here -- `PrisonSaveRepository` itself, or anything that could build one -- would mean the pure decision module had started reaching storage, and that is the change this entry exists to catch.",
  },
  {
    file: 'src/ui/save-panel-delete.ts',
    tree: 'services',
    kind: 'type-only',
    reason:
      "Type-only: `MessageParameters`, the parameter bag beside the key. Same reading as the `content` entry above and as `save-panel.ts`'s own `services` entry: this module chooses a key and its parameters and resolves nothing, so it needs no value from the localization runtime. A `value` import appearing here would mean a decision module had started formatting text, which is the composing layer's job and the thing ADR 0011's last-possible-moment rule keeps out of pure functions.",
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
    file: 'src/ui/display-scale-messages.ts',
    tree: 'content',
    kind: 'type-only',
    reason:
      "Type-only: `LocalizationKey` from `src/content/localization`. A frozen registry of the interface-scale control's three message keys and nothing else, in the shape `src/ui/hud/messages.ts`, `save-panel-messages.ts` and `brand-messages.ts` all use; naming the key type is what lets `satisfies Readonly<Record<string, LocalizationKey>>` check every entry at compile time. Erased, so no content code runs because of it, and it names no other layer.",
  },
  {
    file: 'src/ui/app-shell-messages.ts',
    tree: 'content',
    kind: 'type-only',
    reason:
      "Type-only: `LocalizationKey` from `src/content/localization`. A frozen registry of one key -- the accessible name of `<main id=\"app\">`, the element the whole application mounts into -- in the shape `display-scale-messages.ts`, `save-panel-messages.ts` and `brand-messages.ts` all use; naming the key type is what lets `satisfies Readonly<Record<string, LocalizationKey>>` check the entry at compile time. Erased, so no content code runs because of it, and it names no other layer. Added when `index.html`'s hard-coded `aria-label` moved into the catalogue, so `src/main.ts` -- the one file that reaches `document.getElementById('app')` -- has a key to resolve rather than a literal to splice in.",
  },
  {
    file: 'src/ui/display-scale.ts',
    tree: 'content',
    kind: 'type-only',
    reason:
      "Type-only: `LocalizationKey`, to type the control's `DisplayScaleLocalizer` port and the keys it resolves. The same erased naming-of-a-key-type `save-panel-messages.ts`, `simulation-alerts.ts` and `brand-badge.ts` make; no content code runs because of it.",
  },
  {
    file: 'src/ui/display-scale.ts',
    tree: 'input',
    kind: 'value',
    reason:
      "Value: `snapUiScaleToStep`, `nextUiScaleStep` and `isUiScaleEnlarged` from `src/input/accessibility`, plus the erased `AccessibilitySettings`. (This reason named `stepUiScale` and `canStepUiScale` until 2026-08-29; neither has ever been exported, so the entry described its own subject by names that did not resolve.) **The kind is the point of this entry, and so is the direction.** #545's finding was that `uiScale` was declared, range-checked and persisted in that module and read by nothing; a control that decided for itself which values are legal would close the issue by creating a second vocabulary -- the stylesheet at one set of steps and the storage key's validator at another -- which is the same class of defect one level along. So the steps and the arithmetic over them stay beside the range a persisted record is checked against, and this module calls them. All three are pure functions of a number: they touch no DOM, no store and no event surface, which is what `tests/foundation/documentation-claims-contract.test.ts` holds for that file from the other side. `src/input/**` imports no package at all (`tests/unit/input-module-boundaries.test.ts` asserts it outright), so this is the narrowest kind of value dependency available -- but that is a fact about that tree and not something this gate follows, exactly as the `generation-policy.ts` entries record. A value import of `src/input/storage.ts` would be the erosion to catch: it would mean the control had started reading and writing the settings store itself instead of being handed a scale by the composition root, which is what keeps it *controlled*.",
  },
  {
    file: 'src/ui/display-scale.ts',
    tree: 'services',
    kind: 'type-only',
    reason:
      "Type-only: `MessageParameters`, for the `format(key, parameters)` signature of the `DisplayScaleLocalizer` port the composition root satisfies with the page's one `Localizer`. The same erased dependency `save-panel.ts` and `telemetry-consent-prompt.ts` carry; the control constructs no localizer of its own and never falls back to one.",
  },
  {
    file: 'src/ui/language-messages.ts',
    tree: 'content',
    kind: 'type-only',
    reason:
      "Type-only: `LocalizationKey` from `src/content/localization`. A frozen registry of the language control's five message keys and nothing else, in the shape `theme-messages.ts` and `display-scale-messages.ts` use; naming the key type is what lets `satisfies Readonly<Record<string, LocalizationKey>>` check every entry at compile time. Erased, so no content code runs because of it, and it names no other layer.",
  },
  {
    file: 'src/ui/language.ts',
    tree: 'content',
    kind: 'type-only',
    reason:
      "Type-only: `LocalizationKey`, to type the control's `LanguageLocalizer` port and the endonym table it resolves through. The same erased naming-of-a-key-type `theme.ts` and `display-scale.ts` make; no content code runs because of it.",
  },
  {
    file: 'src/ui/language.ts',
    tree: 'input',
    kind: 'value',
    reason:
      "Value: `nextLanguagePreference` from `src/input/language-preference`, plus the erased `LanguagePreference` and `OfferedLocale`. **The same shape as `theme.ts`'s entry above and no step further**, which is the comparison that matters because the erosion it names is the one this control is most exposed to. Which preferences exist, and what \"the next one\" means, are properties of the persisted record and live beside the decoder that checks a stored value against them. `nextLanguagePreference` is pure -- a function of a string. What this module deliberately does **not** import is `src/input/storage.ts`: a language change is the one preference here whose write must be *read back* by the caller (a refused write cancels the reload), and a control that stored it itself would be deciding to reload as well as asking to. `src/main.ts` owns both ends, exactly as it does for the theme.",
  },
  {
    file: 'src/ui/language.ts',
    tree: 'services',
    kind: 'type-only',
    reason:
      "Type-only: `MessageParameters`, for the `format(key, parameters)` signature of the `LanguageLocalizer` port the composition root satisfies with the page's one `Localizer`. The same erased dependency `theme.ts` and `display-scale.ts` carry; the control constructs no localizer of its own and never falls back to one -- which matters more here than elsewhere, since a language control holding a second localizer would be the one surface guaranteed to disagree with the page.",
  },
  {
    file: 'src/ui/theme-messages.ts',
    tree: 'content',
    kind: 'type-only',
    reason:
      "Type-only: `LocalizationKey` from `src/content/localization`. A frozen registry of the theme control's four message keys and nothing else, in the shape `display-scale-messages.ts` and `brand-messages.ts` use; naming the key type is what lets `satisfies Readonly<Record<string, LocalizationKey>>` check every entry at compile time. Erased, so no content code runs because of it, and it names no other layer.",
  },
  {
    file: 'src/ui/theme.ts',
    tree: 'content',
    kind: 'type-only',
    reason:
      "Type-only: `LocalizationKey`, to type the control's `ThemeLocalizer` port and the keys it resolves. The same erased naming-of-a-key-type `display-scale.ts` and `brand-badge.ts` make; no content code runs because of it.",
  },
  {
    file: 'src/ui/theme.ts',
    tree: 'input',
    kind: 'value',
    reason:
      "Value: `THEME_PREFERENCES`, `isThemePreference` and `resolveTheme` from `src/input/theme-preference`, plus the erased `Theme` and `ThemePreference`. **The same shape as `display-scale.ts`'s entry above, and deliberately not one step further.** Which preferences exist, and which theme each resolves to given what the device asks for, are properties of the persisted record -- they live beside the decoder that checks a stored value against them, so the storage key and the control cannot end up with two vocabularies. All three are pure: `resolveTheme` is a function of a string and a boolean, and this module reads `prefers-color-scheme` through a port it is handed rather than inside them. That entry names the erosion to catch -- \"a value import of `src/input/storage.ts` ... would mean the control had started reading and writing the settings store itself instead of being handed a scale by the composition root\" -- and an earlier draft of this module did exactly that. This gate is what found it: `createThemeController` now takes the stored preference and a `persist` callback, and `src/main.ts` owns both ends.",
  },
  {
    file: 'src/ui/theme.ts',
    tree: 'services',
    kind: 'type-only',
    reason:
      "Type-only: `MessageParameters`, for the `format(key, parameters)` signature of the `ThemeLocalizer` port the composition root satisfies with the page's one `Localizer`. The same erased dependency `display-scale.ts` and `save-panel.ts` carry; the control constructs no localizer of its own and never falls back to one.",
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
    kind: 'value',
    reason:
      '**This entry read `type-only` until #680**, and the erased names it described are unchanged: `RefusalReason`, `ProtocolFaultCode` and `WorkerToMainMessage` from `src/simulation/protocol/types`. Its reason still holds and is kept: it reads the refusal off a status-counts publication into a HUD alert row -- the same shape as `simulation-counts.ts` beside it, and for the same reason: the HUD may not import the simulation (`AGENTS.md` boundary 1), so the module that has to know both a protocol message and a view model sits outside `src/ui/hud/`. The one value it now names is `PROTOCOL_FAULT_CODES`, the closed twelve-member fault vocabulary, read by `protocolFaultMessageKeyOf` to decide whether a thrown value declared a fault this catalogue has a sentence for. The save panel used to splice a `WorkerFaultError`\'s raw English into a localised template, so a player in any language read "Simulation worker fault (already-initialized): Kernel is already initialized." (#680); routing that through the key this module already owns is what removes it. The alternative is a second copy of the vocabulary -- either a `string[]` restated here or an `instanceof` against `src/persistence/session/worker-session-host.ts` -- and both are worse: the first drifts silently from the protocol, and the second would make a view depend on the persistence seam to read a protocol value. What the old `type-only` kind protected is named and still true: the value is a frozen array of string literals, and **no simulation code runs because of it**. A value import of a decoder, a runtime factory or a kernel would be the erosion this entry exists to catch and would still fail review. The `Record`s over `RefusalReason` and `ProtocolFaultCode` remain what makes a reason or a code added to the protocol fail to compile until it has something to say (#261).',
  },
  {
    file: 'src/ui/simulation-events.ts',
    tree: 'content',
    kind: 'type-only',
    reason:
      'Type-only: `LocalizationKey` from `src/content/localization`, so the `Record` over `SimulationEventType` can be checked at compile time to give every event type a message key and a severity. Exactly the use `simulation-alerts.ts` above makes of it, and for the same purpose; erased, so no content code runs because of it.',
  },
  {
    file: 'src/ui/simulation-events.ts',
    tree: 'simulation',
    kind: 'value',
    reason:
      '**This entry read `type-only` until the owner\'s decisions of 2026-09-01 on [ADR 0084](../../docs/adr/0084-what-the-alerts-channel-owes-a-player.md)**, and the erased names it described are unchanged: `SimulationEvent`, `SimulationEventType` and `WorkerToMainMessage` from `src/simulation/protocol/types`. Its reason still holds and is kept: it reads a `simulation/event` publication into a HUD alert row and a band notice and does nothing else -- the same shape as `simulation-alerts.ts` beside it, and for the same reason: the HUD may not import the simulation (`AGENTS.md` boundary 1), so the module that has to know both a protocol message and a view model sits outside `src/ui/hud/`. The `Record` over `SimulationEventType` is still what makes an event type added to the protocol fail to compile until somebody has decided what it says to a player and how loudly (#507). **Two values are now named, and both are pure functions the alternative to which is a second copy of a rule.** `simulationEventIdentity` decides when two arrivals are the same statement, and the worker resolves a dismissal by the same function -- two answers to that question is exactly how a row the player retired would come back holding the wrong arrivals. `projectClockPosition` turns an event\'s tick into the day a row says it happened on; it is *"the one piece of clock arithmetic in the codebase, so a caller cannot disagree with the status strip about which day it is"*, and `simulation-clock.ts`\'s entry above already names the same value for the same reason. Neither touches state: one stringifies an object, the other divides a number. A value import of a decoder, a runtime factory or a kernel would still be the erosion this entry exists to catch.',
  },
  {
    file: 'src/ui/simulation-conditions.ts',
    tree: 'simulation',
    kind: 'type-only',
    reason:
      "Type-only: `PrisonCondition` from `src/simulation/protocol/types`, so an exhaustive `Record` over the closed union can be checked at compile time -- exactly the use `simulation-alerts.ts` makes of `RefusalReason` and `simulation-events.ts` of `SimulationEventType`, and for the same purpose: a sixth member added to the protocol fails to compile here until somebody has decided whether and where the player is told about it ([ADR 0117](../../docs/adr/0117-what-happens-when-a-guards-post-is-walled-in.md), accepted by the owner on 2026-09-17). The module is a table and one `some` over it; it resolves no text, names no message key and holds no state, and the erasure means no simulation code runs because of it. It lives outside `src/ui/hud/` for that directory's standing reason: the HUD may not import the simulation (`AGENTS.md` boundary 1), so the module that has to know a protocol vocabulary sits beside `simulation-counts.ts`, which is its only caller.",
  },
  {
    file: 'src/ui/simulation-counts.ts',
    tree: 'content',
    kind: 'value',
    reason:
      "Value: `deriveSimulationMessageKey` from `src/content/simulation-message-keys`, to label the open incident's kind (issue #506 finding 2). The same reason every other `value`-content entry in this manifest gives, `simulation-intake.ts`'s first: the alternative is a hand-written table of four `incident-type.*.name` strings, which is exactly the drift that module's derivation rule exists to prevent -- a member added to `IncidentType` renames or adds its key in one edit rather than two staying in sync by hand. The function composes a string from a namespace and an id; it reads no catalogue, resolves no text and holds no state, so calling it runs no content logic in the sense this manifest measures.",
  },
  {
    file: 'src/ui/simulation-counts.ts',
    tree: 'simulation',
    kind: 'type-only',
    reason:
      'Type-only: `WorkerToMainMessage` from `src/simulation/protocol/types`. It reads counts off snapshot messages into a HUD view model and nothing else; 57 lines, no simulation code runs because of it.',
  },
  {
    file: 'src/ui/simulation-intake.ts',
    tree: 'content',
    kind: 'value',
    reason:
      "Value: `deriveSimulationMessageKey` from `src/content/simulation-message-keys`, to label an intake stage. The only `value` content dependency in this manifest, and it is one on purpose: the alternative is a hand-written table of six `intake-stage.*.name` strings, which is exactly the drift that module's derivation rule exists to prevent -- it says a message key is *never* hand-authored, so that renaming a stage renames its key in one edit. The function composes a string from a namespace and an id; it reads no catalogue, resolves no text and holds no state, so calling it runs no content logic in the sense this manifest measures. `src/ui/hud/build-panel.ts` makes the same call for `build-order-state` under the HUD's own stricter gate, which is what settles that the dependency is content-shaped rather than simulation-shaped.",
  },
  {
    file: 'src/ui/simulation-intake.ts',
    tree: 'simulation',
    kind: 'type-only',
    reason:
      "Type-only: `PrisonerPopulationCountsViewModel` from `src/simulation/presentation/prisoner-projection`. The seventh of the translators outside `src/ui/hud/` and the third that reads a *pulled* read model, so it is `simulation-build-queue.ts`'s entry above one projection over: it names the view-model shape `hud/prisoner-population` answers with and turns it into `HudIntakePipelineViewModel`. The stage union it classifies is read off that same view-model type rather than from `src/simulation/prisoners/components.ts`, deliberately, so this module's one simulation dependency stays on the presentation layer instead of reaching into the prisoner runtime. Erased, so no simulation code runs on its account -- the projection executes in the worker. A `value` import appearing here would mean the pipeline had started being counted on the main thread from records it does not own, which is the second source of truth `AGENTS.md` boundary 1 forbids.",
  },
  {
    file: 'src/ui/simulation-held-guards.ts',
    tree: 'content',
    kind: 'value',
    reason:
      "Value: `deriveSimulationMessageKey` from `src/content/simulation-message-keys`, to label a guard's claim -- plus the erased `LocalizationKey`, which types the `StaffRoleLabelLookup` the composition root hands it. The **second** `value` content dependency in this manifest, beside `simulation-intake.ts`'s, and it is one for the identical reason that entry gives: the alternative is a hand-written table of four `guard-claim.*.name` strings, which is exactly the drift that module's derivation rule exists to prevent. The function composes a string from a namespace and an id; it reads no catalogue, resolves no text and holds no state, so calling it runs no content logic in the sense this manifest measures. The role's key is *not* derived here and is injected instead, because a staff role's `nameKey` is authored in `src/content/staff-role-catalog.ts` rather than derived -- so the two names on one row come from the two different mechanisms that legitimately own them (ADR 0034).",
  },
  {
    file: 'src/ui/simulation-held-guards.ts',
    tree: 'simulation',
    kind: 'type-only',
    reason:
      "Type-only: `HeldGuardsViewModel` from `src/simulation/presentation/guard-release-projection`. The ninth of the translators outside `src/ui/hud/` and the fifth that reads a *pulled* read model, so it is `simulation-pending-deliveries.ts`'s entry below one projection over: it names the view-model shape `hud/held-guards` answers with and turns it into `HudHeldGuardsViewModel`. Erased, so no simulation code runs on its account -- the projection executes in the worker, and it has to, because resolving what is holding a guard means asking both `'on-search'` claimants live (ADR 0033 decision 4, ADR 0034). A `value` import here would be the sharpest violation in this manifest: it would mean the main thread had started deciding *which system holds a guard* from a roster it does not own, and every row it produced carries a guard id that a press releases.",
  },
  {
    file: 'src/ui/simulation-pending-deliveries.ts',
    tree: 'content',
    kind: 'type-only',
    reason:
      "Type-only: `LocalizationKey` from `src/content/localization`, to type the `ItemLabelLookup` the composition root hands it. The same erased naming-of-a-key-type `simulation-build-queue.ts`'s entry above makes, and for the same reason: what an item is *called* lives in `src/content/item-catalog.ts`, and this module is handed the lookup rather than the catalogue -- so a delivery of something unnamed reaches the panel as a row with no `labelKey` instead of this module resolving one.",
  },
  {
    file: 'src/ui/simulation-pending-deliveries.ts',
    tree: 'simulation',
    kind: 'type-only',
    reason:
      "Type-only: `PendingDeliveriesViewModel` from `src/simulation/presentation/procurement-projection`. The eighth of the translators outside `src/ui/hud/` and the fourth that reads a *pulled* read model, so it is `simulation-build-queue.ts`'s entry above one projection over: it names the view-model shape `hud/pending-deliveries` answers with and turns it into `HudPendingDeliveriesViewModel`. Erased, so no simulation code runs on its account -- the projection executes in the worker. A `value` import here would be worse than anywhere else in this manifest: it would mean money in transit had started being totalled on the main thread from deliveries it does not own, and every row it produced carries a purchase id that a press *refunds* (#285).",
  },
  {
    file: 'src/ui/simulation-staff-coverage.ts',
    tree: 'simulation',
    kind: 'type-only',
    reason:
      "Type-only: `StaffViewModel` from `src/simulation/presentation/staff-projection`. The tenth of the translators outside `src/ui/hud/` and the sixth that reads a *pulled* read model, so it is `simulation-held-guards.ts`'s entry above one projection over: it names the view-model shape `hud/staff` answers with and turns its `totals` into `HudStaffCoverageViewModel`. Erased, so no simulation code runs on its account -- the projection executes in the worker, and it has to, because how many guards a sector requires is `DeploymentSystem.requiredGuardCountFor`'s answer over occupancy and an authored schedule (ADR 0048 decision 3), neither of which this thread holds. A `value` import here would mean the main thread had started deciding *how many guards this prison needs*, which is a second definition of a rule the deployment system enforces -- so the panel would eventually warn about a requirement nothing was acting on. It imports no `src/content/**` at all, unlike the two readers above it: the block renders three integers and the HUD's own message keys, so there is no content name to resolve.",
  },
  {
    file: 'src/ui/simulation-staff-roster.ts',
    tree: 'content',
    kind: 'value',
    reason:
      "Value: `deriveSimulationMessageKey` from `src/content/simulation-message-keys`, to label what a staff member is doing -- plus the erased `LocalizationKey`, which types the `StaffRoleLabelLookup` the composition root hands it. The **fourth** `value` content dependency in this manifest, and it earns its place for the reason the three before it give: the alternative is a hand-written table of four `deployment-phase.*.name` strings, which is the drift that module's derivation rule exists to prevent. `'deployment-phase'` and **not** `'guard-claim'`, which is the namespace `simulation-held-guards.ts` derives one entry up, and the difference is the whole reason these are two readers: a claim answers *which system is holding this guard* and its resolution needs both `'on-search'` claimants asked live inside the simulation (ADR 0033 decision 4), while a phase is a field the roster already carries. Deriving a claim here would be the main thread guessing; deriving a phase is naming something the projection sent (#533).",
  },
  {
    file: 'src/ui/simulation-staff-roster.ts',
    tree: 'simulation',
    kind: 'type-only',
    reason:
      "Type-only: `StaffViewModel` from `src/simulation/presentation/staff-projection`. The eleventh of the translators outside `src/ui/hud/` and the seventh that reads a *pulled* read model, and it is the **second** reader of `hud/staff` -- beside `simulation-staff-coverage.ts` above, which asks the same projection with `limit: 0` for totals and no rows. Two readers on one projection because they ask for different things, not because one was forgotten: merging them would tie a warning readout's cadence to a control list's and publish a window one of them cannot use. Erased, so no simulation code runs on its account -- the projection executes in the worker. A `value` import here would be the sharpest violation in this manifest alongside `simulation-held-guards.ts`'s: it would mean the main thread had started deciding *who is employed* from a roster it does not own, and every row it produced carries a staff id that a press **destroys** (#533).",
  },
  {
    file: 'src/ui/simulation-prisoner-detail.ts',
    tree: 'simulation',
    kind: 'type-only',
    reason:
      "Type-only: `PrisonerDetailViewModel` from `src/simulation/presentation/prisoner-projection` (issue #895). The thirteenth of the translators outside `src/ui/hud/` and the ninth that reads a *pulled* read model, and the first of any of them whose request names **one** row -- `hud/prisoner-detail` is `target: 'entity'`, so the id the player pressed on a roster row is what crosses. It derives no message key of its own and therefore has no `content` entry beside this one, unlike its sibling: the two rules it needs are `prisonerNeed` and `prisonerStandingLabelKey`, exported from `src/ui/simulation-prisoner-roster.ts` so that the roster and the inspector cannot disagree about a prisoner whose classification has not run yet -- a same-tree import, which this gate does not and should not see. Erased, so no simulation code runs on its account; the projection executes in the worker, and it has to, because `projectPrisonerDetail` starts with `entityStore.isAlive(entityId)` over a store this thread does not hold, and its `unmetForStateIncome` per need is `STATE_INCOME_UNMET_NEED_LEVEL` applied in `src/simulation/economy/income.ts`. A `value` import here would mean the main thread had started deciding what the state is withholding from whom, which is a balance number on the thread that owns none.",
  },
  {
    file: 'src/ui/simulation-prisoner-roster.ts',
    tree: 'content',
    kind: 'value',
    reason:
      "Value: `deriveSimulationMessageKey` from `src/content/simulation-message-keys`, to label an action, an action phase, a risk tier and an intake stage -- four namespaces from one module, which is more than any other entry here derives and is the reason the roster is renderable at all. The **third** `value` content dependency in this manifest, beside `simulation-intake.ts`'s and `simulation-held-guards.ts`'s, and it is one for the identical reason both of those give: the alternative is a hand-written table of nine `action.*.name`, three `action-phase.*.name`, four `risk-tier.*.name` and six `intake-stage.*.name` strings, which is exactly the drift that module's derivation rule exists to prevent -- it says a message key is *never* hand-authored, so renaming an action renames its key in one edit. The function composes a string from a namespace and an id; it reads no catalogue, resolves no text and holds no state, so calling it runs no content logic in the sense this manifest measures.",
  },
  {
    file: 'src/ui/simulation-prisoner-roster.ts',
    tree: 'simulation',
    kind: 'type-only',
    reason:
      "Type-only: `PrisonerRosterPage` and `PrisonerRosterRowViewModel` from `src/simulation/presentation/prisoner-projection` (issue #506 added the first, alongside `everAdmitted`, to say what `ViewModelPage` alone could not: that a prisoner has been admitted this session even though the live count has fallen back to zero). The eleventh of the translators outside `src/ui/hud/` and the seventh that reads a *pulled* read model, so it is `simulation-staff-coverage.ts`'s entry above one projection over: it names the view-model shape `hud/prisoner-roster` answers with and turns each row into a `HudPrisonerRowViewModel`. The `ActionPhase` union it tests against is read off that same view-model type rather than from `src/simulation/prisoners/components.ts`, deliberately, so this module's simulation dependency stays on the presentation layer instead of reaching into the prisoner runtime -- the rule `simulation-intake.ts` states for `IntakeStage`. Erased, so no simulation code runs on its account; the projection executes in the worker, and it has to, because which action a prisoner is on is `ActionSystem`'s selection over a regime schedule and a utility score, and the liveness walk behind the roster is over an `EntityStore` this thread does not hold. A `value` import here would mean the main thread had started deciding *what a prisoner is doing*, which is the second source of truth `AGENTS.md` boundary 1 forbids in its purest form.",
  },
  /*
   * The Security section's three readers (2026-09-17). Six entries, and the
   * one to read is `simulation-incidents.ts`'s `value` simulation import, which
   * is the first in this manifest.
   */
  {
    file: 'src/ui/simulation-security.ts',
    tree: 'content',
    kind: 'value',
    reason:
      "Value: `deriveSimulationMessageKey` from `src/content/simulation-message-keys`, to label a sector's control state. The reason is the one every `value` content entry above gives: the alternative is a hand-written table of three `sector-control-state.*.name` strings, which is the drift that module's derivation rule exists to prevent. The function composes a string from a namespace and an id; it reads no catalogue, resolves no text and holds no state. The grade's word is *not* derived -- a security grade is content with its own `nameKey`, and the projection carries it -- so this module derives exactly one namespace.",
  },
  {
    file: 'src/ui/simulation-security.ts',
    tree: 'simulation',
    kind: 'type-only',
    reason:
      "Type-only: `SecurityViewModel` from `src/simulation/presentation/security-projection`. The fourteenth of the translators outside `src/ui/hud/` and the tenth that reads a *pulled* read model: it names the view-model shape `hud/security` answers with and narrows it to `HudSecurityViewModel`. Erased, so no simulation code runs on its account -- the projection executes in the worker, and it has to, because a sector's `required` is `DeploymentSystem.requiredGuardCountFor`'s answer over occupancy and an authored schedule (ADR 0048 decision 3) and its `controlState` is the sector registry's, neither of which this thread holds. A `value` import here would mean the main thread had started deciding whether a sector is under lockdown, which is a rule the door system enforces against a state this thread cannot see.",
  },
  {
    file: 'src/ui/simulation-incidents.ts',
    tree: 'content',
    kind: 'value',
    reason:
      "Value: `deriveSimulationMessageKey` from `src/content/simulation-message-keys`, to label an incident's type and its state -- two namespaces, both declared against `src/simulation/incidents/incident.ts`. The reason is every other `value` content entry's: the alternative is a hand-written table of four `incident-type.*.name` and five `incident-state.*.name` strings, which is the drift that rule exists to prevent.",
  },
  {
    file: 'src/ui/simulation-incidents.ts',
    tree: 'simulation',
    kind: 'value',
    reason:
      "**Value, and it is the FIRST `value` simulation dependency in this manifest, so it is the entry to argue with.** What it imports is two numeric constants -- `INCIDENT_SEVERITY_MAX` and `INCIDENT_PROPERTY_DAMAGE_MAX` from `src/simulation/presentation/incident-projection` -- alongside the erased `IncidentsViewModel`, `IncidentDetailViewModel` and `IncidentRowViewModel` this module is really about. It runs no simulation code: two `export const` numbers have no behaviour, and the projection itself still executes in the worker. What it buys is a player-visible sentence that is true by construction: the panel renders *\"Severity 8 of 10\"*, `incident.ts` documents both as published `0-10` scales, and the only alternatives were to write `10` into `src/ui/hud/` -- a second declaration of a simulation scale, which is what this manifest exists to catch -- or to print a rank with no scale beside it, which is a number a player cannot read. `BoundedValue` cannot supply it: it carries `permille`, `filled` and `segments` and not the maximum, so the ceiling is genuinely not on the wire. The test of whether this entry is being abused is narrow and checkable: it may name constants, and the day it names a function or a class this reason stops covering it.",
  },
  {
    file: 'src/ui/simulation-contraband.ts',
    tree: 'content',
    kind: 'value',
    reason:
      "Value: `deriveSimulationMessageKey` from `src/content/simulation-message-keys`, to label a search's scope and its order state. `'search-order-state'` rather than the search system's own job-state union, and the difference is why that namespace exists at all: an order accepted and not yet assigned a guard has no job record, so `'queued'` is a state the row must be able to say and no `SearchJobState` covers it. A contraband category's word is *not* derived -- it is content with its own `nameKey`, which the projection carries -- so this module derives exactly two namespaces.",
  },
  {
    file: 'src/ui/simulation-contraband.ts',
    tree: 'simulation',
    kind: 'type-only',
    reason:
      "Type-only: `ContrabandViewModel` from `src/simulation/presentation/contraband-projection`. The sixteenth of the translators outside `src/ui/hud/` and the twelfth that reads a *pulled* read model. Erased, so no simulation code runs on its account -- and this is the projection where that matters most in this manifest, because `ContrabandRegistry` is ground truth about where concealed items actually are and `contraband-projection.ts`'s own header is explicit that it must never reach a panel. A `value` import here would put the module that decides what a player may know about contraband on the thread that renders it.",
  },
  {
    file: 'src/ui/simulation-regime.ts',
    tree: 'content',
    kind: 'value',
    reason:
      "Value: `deriveSimulationMessageKey` from `src/content/simulation-message-keys`, to label a classification group and an action category. The **fourth** `value` content dependency in this manifest and the last of the four to arrive; the reason is the one the other three give, and the derivation is what stops a second spelling of `classification-group.high-risk.name` existing anywhere. The function composes a string from a namespace and an id; it reads no catalogue, resolves no text and holds no state.",
  },
  {
    file: 'src/ui/simulation-regime.ts',
    tree: 'simulation',
    kind: 'type-only',
    reason:
      "Type-only: `StatusStripViewModel` from `src/simulation/presentation/status-strip-projection`. The twelfth of the translators outside `src/ui/hud/` and the eighth that reads a *pulled* read model: it names the view-model shape `hud/status-strip` answers with and turns its `regime` array into `HudRegimeViewModel`. Erased, so no simulation code runs on its account -- and the erasure is doing real work here, because the module it names also exports nothing this thread may run: which block is active is `resolveActiveRegimeBlock`'s answer over a schedule and a tick, and computing it here would be a second definition of what the prison is doing now, on a thread that holds neither the schedule array `ActionSystem` was constructed with nor the authoritative tick. It reads the whole strip view model and uses one field of it, which is deliberate: `projection-catalog.ts` builds that projection from the same source the timer publication uses, so the pull route and the push route cannot disagree.",
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
    file: 'src/ui/object-tool.ts',
    tree: 'rendering',
    kind: 'type-only',
    reason:
      'Type-only: `ObjectToolPort` and `TileRect` from `src/rendering/build/area-picking`. The exact shape of `room-tool.ts`\'s entry below and the same argument one gesture over again: `ObjectToolPort` is a port the renderer *offers* -- the scene reports the tile a press landed on and asks this module for the footprint to draw -- so the direction is UI-onto-a-renderer-contract rather than UI-into-renderer-internals, and it is erased. It is a third module rather than more methods on `BuildTool` because the three ports carry different shapes and this one holds a footprint, which the class that lays walls has no concept of; `src/ui/object-tool.ts`\'s header states that rule against `BuildTool`\'s own. A value import here would mean the orchestrator had started calling into the renderer, which is what both of the other two entries say too.',
  },
  {
    file: 'src/ui/room-tool.ts',
    tree: 'rendering',
    kind: 'type-only',
    reason:
      'Type-only: `RoomToolPort` and `TileRect` from `src/rendering/build/area-picking`, and -- since issue #493 -- `WorldRenderView` from `src/rendering/world/world-view`. The exact shape of `build-tool.ts`\'s entry above and the same argument one gesture over: `RoomToolPort` is a port the renderer *offers* -- the scene reports the rectangle of tiles a drag covered and this module turns it into something the HUD can dispatch -- so the direction is UI-onto-a-renderer-contract rather than UI-into-renderer-internals, and it is erased. It is a second module rather than more methods on `BuildTool` because the two ports carry different shapes and the room tool carries a removal mode; `src/ui/room-tool.ts`\'s header states that rule against `BuildTool`\'s own. `WorldRenderView` joined the same entry rather than opening a new one: it names only a *type*, held as `private world: WorldRenderView | undefined` and handed in once a frame by `setWorld` -- this module never constructs one, so the dependency stays erased. A value import of either name would mean the orchestrator had started calling into the renderer, which is what every entry in this pair already says.',
  },
  {
    file: 'src/ui/room-tool.ts',
    tree: 'simulation',
    kind: 'value',
    reason:
      'Value: `roomPerimeterEnclosure` and `RoomEnclosure` from `src/simulation/rooms/enclosure` (issue #493). A pure helper, read here and never mutated: it walks the two edge layers a `WorldRenderView` already decodes for painting walls and answers whether a rectangle\'s own perimeter is closed, which is exactly the question `classifyArea` exists to answer for the panel\'s pre-confirm warning. The alternative is a second implementation of the same perimeter walk against the renderer\'s own copy of the edge layers, which is the exact class of drift #93 found between two independent readings of tile ownership -- `WorldRenderView.isTileOwned`\'s own comment records that history and the fix it took (import the simulation\'s `isTileOwnedBy` rather than restate the rule). `roomPerimeterEnclosure`\'s parameter is `RoomEdgeReader`, a two-method port `SparseWorld` already satisfies structurally, so nothing on the simulation side of this changed and no other call site was touched. This module still builds no simulation runtime and submits no command: `classifyArea` only ever answers a question, and the two producers of a rectangle (a world drag, the panel\'s typed-coordinates form) both still leave the panel by an intent this module reports, never a `ZoneRoom` it composes.',
  },
  {
    file: 'src/ui/simulation-build-queue.ts',
    tree: 'content',
    kind: 'type-only',
    reason:
      "Type-only: `LocalizationKey` from `src/content/localization`, to type the `BuildableLabelLookup` the composition root hands it. The same erased naming-of-a-key-type `simulation-alerts.ts` and `brand-badge.ts` make; no content code runs because of it. It names the type rather than reading a catalogue *because* of the boundary this manifest is about: what a buildable is called is `buildableLabelKey`'s answer in `src/main.ts`, and this module is handed the function rather than the table.",
  },
  {
    file: 'src/ui/simulation-build-queue.ts',
    tree: 'simulation',
    kind: 'type-only',
    reason:
      "Type-only: `BuildQueueViewModel` from `src/simulation/presentation/construction-projection`. The sixth of the translators outside `src/ui/hud/` and the second that reads a *pulled* read model, so it is `simulation-room-needs.ts`'s entry above one projection over: it names the view-model shape `hud/build-queue` answers with and turns it into `HudBuildQueueViewModel`. Erased, so no simulation code runs on its account -- the projection executes in the worker, and everything this module knows about the channel it gets from `src/ui/simulation-projections.ts` beside it, which is an intra-tree import. A `value` import appearing here would mean the queue had started being derived on the main thread from orders it does not own, which is the second source of truth `AGENTS.md` boundary 1 forbids -- and it would be worse here than for the room readout, because every row this produces carries an order id that a press *cancels*.",
  },
  {
    file: 'src/ui/simulation-room-needs.ts',
    tree: 'simulation',
    kind: 'type-only',
    reason:
      'Type-only: `RoomListViewModel` and `RoomDetailViewModel` from `src/simulation/presentation/room-projection`. The fifth of the translators outside `src/ui/hud/`, and the first that reads a *pulled* read model rather than a publication: it names the two view-model shapes `hud/room-list` and `hud/room-detail` answer with, and turns the `missing-capability` verdict inside them into `HudRoomNeedsViewModel`. Erased, so no simulation code runs on its account -- the projections themselves execute in the worker, and everything this module knows about the channel it gets from `src/ui/simulation-projections.ts` beside it, which is an intra-tree import. A `value` import appearing here would mean the readout had started projecting rooms on the main thread from state it does not own, which is the second source of truth `AGENTS.md` boundary 1 forbids and the reason the verdict is asked for rather than computed.',
  },
  {
    file: 'src/ui/telemetry-consent-prompt.ts',
    tree: 'content',
    kind: 'type-only',
    reason:
      'Type-only: `LocalizationKey` from `src/content/localization`, to type the `TelemetryConsentLocalizer` port the composition root satisfies with the page\'s one `Localizer`. The same erased naming-of-a-key-type `save-panel-messages.ts`, `simulation-alerts.ts` and `brand-badge.ts` make; no content code runs because of it.',
  },
  {
    file: 'src/ui/telemetry-consent-prompt.ts',
    tree: 'services',
    kind: 'value',
    reason:
      'Value: `EMPTY_TELEMETRY_CONSENT_DRAFT`, `TELEMETRY_CONSENT_MESSAGE_KEY`, `TELEMETRY_CONSENT_ROWS` and `setTelemetryConsentCategory` from `src/services/telemetry/consent-flow`. This is the manifest\'s point rather than an exception to it: the *value* import is what makes this module thin. Every decision the consent surface takes -- which categories exist, which label each carries, what the draft starts as, what a toggle does to it -- is computed there and none of it is computed here, because `vitest.config.ts` runs in `node` with no jsdom, so a decision taken in this file would be a privacy control with no headless coverage. The direction is UI-onto-a-services-contract and the reverse is structurally impossible: `tests/unit/services-layer-boundaries.test.ts` refuses `document.`/`window.` anywhere under `src/services/`. A *type-only* import appearing here would be the regression, not the improvement -- it would mean the rules had moved into the DOM.',
  },
  {
    file: 'src/ui/simulation-zoning.ts',
    tree: 'simulation',
    kind: 'type-only',
    reason:
      'Type-only: `WorkerToMainMessage` from `src/simulation/protocol/types`. The fourth of the translators outside `src/ui/hud/`, the same shape as `simulation-counts.ts` and `simulation-alerts.ts` beside it and for the same reason: the HUD may not import the simulation (`AGENTS.md` boundary 1), so the module that has to know both a protocol message and a view model sits outside `src/ui/hud/`. It reads what the last accepted zoning said about itself off a status-counts publication and returns three plain fields; no simulation code runs because of it, and unlike the other three it names no `content` dependency at all, because it maps no id onto a message key -- the Rooms panel decides which sentence the enum pair deserves.',
  },
  {
    file: 'src/ui/account/account-preferences.ts',
    tree: 'persistence',
    kind: 'value',
    reason:
      "Value: `MigrationChain` from `src/persistence/migration` and `zodVersionSchema` from `src/persistence/zod-version-schema`. Account preferences are a *persisted* record, so `AGENTS.md` boundary 7 applies to them -- every persistent format must have a version and migration strategy -- and this is the repository's one implementation of that. A type-only import cannot satisfy the boundary, because the obligation is to run the chain, not to name it. The direction is UI-onto-a-persistence-mechanism, never persistence-onto-UI: nothing under `src/persistence/` knows this module exists, which is what keeps boundary 5 (persistence consumes explicit snapshots and does not reach into renderer internals) true in both directions. What would make this entry wrong is a save *payload* type appearing here -- preferences are account metadata and #34 is explicit that they stay outside the prison snapshot.",
  },
  {
    file: 'src/ui/account/account-preferences.ts',
    tree: 'shared',
    kind: 'type-only',
    reason:
      "Type-only: `KeyValueStore` from `src/shared/key-value-store`. The module names the storage port it is handed and never constructs one, which is what keeps it testable in `environment: 'node'` where there is no `localStorage` -- the composition root supplies the real store and the tests supply a map. Erased, so no storage code runs on its account. A `value` import here would mean the preferences module had started choosing its own backing store, which is the composition root's job and the reason this tier is separated from `src/main.ts` at all.",
  },
  {
    file: 'src/ui/account/cloud-slot-availability.ts',
    tree: 'services',
    kind: 'value',
    reason:
      "Value: `evaluateSaveSlotAccess` and `evaluateSaveSlotEntitlement` from `src/services/entitlements/projection`, plus three erased types. This is the module that answers how many prisons an identity may keep, and #34 requires that the five-free-slot policy be account metadata rather than hard-coded logic -- so the number is *asked for* rather than restated, and this import is what makes that true. It adds only whether the ladder `applies` at all. A copy of the ladder here, or a literal 5, would be the contamination #34's fourth acceptance criterion forbids, and `tests/foundation/account-metadata-boundaries.test.ts` pins the client's answer against the SQL's.",
  },
  {
    file: 'src/ui/account/save-list-projection.ts',
    tree: 'persistence',
    kind: 'value',
    reason:
      "**This entry read `type-only` until #432.** It still names `PrisonSlotMetadata` from `src/persistence/local/store` for the fold of local and cloud metadata into one row per prison, and it still never reads or writes a store. What it now also imports is one value: `readableGenerationIds` from `src/persistence/local/generation-policy`, which is what keeps `recovery` and `retainedGenerations` honest. A generation quarantined as unreadable (#432) stays in `generationIds`, so counting the raw array would report a prison as `recoverable` on the strength of a copy this build has just refused -- the promise `AGENTS.md`'s fourth exclusion reserves, made by arithmetic. The old reason's protection is intact and is the line to hold: a value import from `repository.ts` or `indexeddb-store.ts` would mean the projection had started opening the store, putting an IndexedDB dependency in a module whose whole point is that it is a pure function, and `src/ui/account/`'s reachability from `pnpm test` is why ADR 0043's states are testable at all. `generation-policy.ts` imports nothing whatever, so nothing of the kind can arrive through it today -- **and that is a fact about that file, not a property this gate checks.** This test compares the kind of a direct import; it does not follow what the imported module itself pulls in. So an import added to `generation-policy.ts` makes this reason false and leaves the suite green, and the person adding it is the only one who can catch it. Rewrite this entry then, or keep that module import-free.",
  },
];

const dependencies = findCrossTreeDependencies(gatedFiles, OWN_TREE);
const report = reportCrossTreeViolations(dependencies, ALLOWED_FOREIGN_TREES);

describe('UI orchestration boundaries', () => {
  it('finds the top-level UI sources it is meant to be checking', () => {
    // Vacuity guard. A filter that stopped matching would leave every rule
    // below asserting about an empty list, which reads exactly like
    // compliance -- the failure mode this whole family of tests exists to
    // avoid, and the one `rendering-module-boundaries.test.ts` and
    // `ui-hud-messages.test.ts` both carry a guard for.
    expect(orchestrationFiles.map(({ file }) => file)).toEqual([
      'src/ui/affordability.ts',
      'src/ui/app-shell-messages.ts',
      'src/ui/brand-badge.ts',
      'src/ui/brand-messages.ts',
      'src/ui/build-tool.ts',
      'src/ui/display-scale-messages.ts',
      'src/ui/display-scale.ts',
      'src/ui/host-refusal.ts',
      'src/ui/language-messages.ts',
      'src/ui/language.ts',
      'src/ui/object-tool.ts',
      'src/ui/prisoner-sentence.ts',
      'src/ui/room-tool.ts',
      'src/ui/save-panel-delete.ts',
      'src/ui/save-panel-messages.ts',
      'src/ui/save-panel.ts',
      'src/ui/simulation-alerts.ts',
      'src/ui/simulation-build-queue.ts',
      'src/ui/simulation-clock.ts',
      'src/ui/simulation-commands.ts',
      'src/ui/simulation-conditions.ts',
      'src/ui/simulation-contraband.ts',
      'src/ui/simulation-counts.ts',
      'src/ui/simulation-events.ts',
      'src/ui/simulation-held-guards.ts',
      'src/ui/simulation-incidents.ts',
      'src/ui/simulation-intake.ts',
      'src/ui/simulation-pending-deliveries.ts',
      'src/ui/simulation-prisoner-detail.ts',
      'src/ui/simulation-prisoner-roster.ts',
      'src/ui/simulation-projections.ts',
      'src/ui/simulation-regime.ts',
      'src/ui/simulation-room-needs.ts',
      'src/ui/simulation-security.ts',
      'src/ui/simulation-staff-coverage.ts',
      'src/ui/simulation-staff-roster.ts',
      'src/ui/simulation-zoning.ts',
      'src/ui/telemetry-consent-prompt.ts',
      'src/ui/theme-messages.ts',
      'src/ui/theme.ts',
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
      .filter((entry) => entry.subtree !== undefined && !isSubtree(entry.subtree, GATED_ELSEWHERE) && !isSubtree(entry.subtree, GATED_HERE))
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
    // Not `allUiFiles.length === orchestrationFiles.length + (the rest)`: that
    // partitions `allUiFiles` by the same predicate on both sides and is a
    // tautology for any array whatsoever, including an empty one -- proved
    // and reported in `docs/research/2026-09-02-the-unit-gates-that-cannot-fail.md`.
    // The real floor belongs on the corpus itself, read independently of how
    // it gets divided: 66 files today, so this tolerates ordinary change
    // while still catching the walk collapsing.
    expect(allUiFiles.length, 'src/ui/ scanned far fewer files than expected; the walk is broken').toBeGreaterThan(50);
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

  it('lets the account subtree import zod and nothing else', () => {
    // The tier-wide "no package" claim stopped being true when
    // `src/ui/account/` landed, so the exception is gated rather than merely
    // described in the header. `account-preferences.ts` persists a record and
    // `AGENTS.md` boundary 7 obliges it to version and migrate one; the
    // repository's schema vocabulary is zod, and `src/persistence/` uses it
    // for exactly this. Naming it here is what stops the exception widening
    // into "the account tree may import packages", which is how a stated
    // exception usually rots.
    const allowed = ['zod'];
    const byFile = gatedHereFiles.map(({ file, source }) => ({
      file,
      packages: findImports(source)
        .map((site) => site.specifier)
        .filter((specifier) => !specifier.startsWith('.'))
        .filter((specifier) => !allowed.includes(specifier)),
    }));
    // Denominator first: an empty collection reports no violations and reads
    // exactly like compliance, which is the failure mode this family exists
    // to avoid.
    expect(byFile.length, 'the account subtree is empty or was renamed').toBeGreaterThan(3);
    expect(
      byFile.filter((entry) => entry.packages.length > 0),
      'a src/ui/account/ module imports a package other than zod. The tier imports no packages; zod is the one exception and it is here because a persisted record must be versioned',
    ).toEqual([]);
    // And the exception is real rather than defensive wording: something in
    // the subtree does import zod, so removing the allowance would fail.
    expect(
      gatedHereFiles.some(({ source }) => findImports(source).some((site) => site.specifier === 'zod')),
      'nothing in src/ui/account/ imports zod any more -- delete the allowance rather than leaving it standing',
    ).toBe(true);
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
