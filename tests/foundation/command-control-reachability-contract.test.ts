import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/canonical-iteration';
import { INTERACTIVE_TAGS, routesForIntent, type Route, type ScannedSource } from '../helpers/control-reachability';
import { simulationCommandSchema } from '../../src/simulation/protocol/commands';

/**
 * The join between the two enumerations that argue *"every present action has
 * a reachable route"*, which until this file was made by a person reading them
 * side by side.
 *
 * The two ends, and what each one already proves:
 *
 * - `tests/foundation/unconsumed-command-contract.test.ts` proves every
 *   literal in `simulationCommandSchema` is **constructed somewhere in
 *   `src/`** -- eighteen of them, every one in `src/main.ts`. It says nothing
 *   about what reaches that construction.
 * - `tests/browser/app-shell.spec.ts`'s `#88` sweep proves every control its
 *   `INTERACTIVE_SELECTOR` matches in the live DOM is **laid out and pressable
 *   at five viewports**, or is named on one of two exemption lists. It says
 *   nothing about which controls issue a command.
 *
 * Both can be green while a command is unreachable. A command whose only
 * producer is a `<div>` with a click handler is a producer the sweep's
 * inventory never collects; a command reached from nothing but a key chord has
 * a submission site and no control at all. The agent that last measured this
 * named the hole as its own weakest claim: *"Nothing in this pass joins the
 * two ends mechanically -- a command whose only producer is a control the
 * sweep's inventory does not collect would satisfy both halves and still be
 * unreachable. The join is done by reading."*
 *
 * `tests/helpers/control-reachability.ts` walks the chain instead, and its
 * header carries the method and the three things the walk cannot see. This
 * file is the accounting over the result, in the shape
 * `NEVER_LAID_OUT_BELOW_720` established: a verdict per command, and for every
 * command that does not reach a control, a named entry with a reason that
 * fails as stale the moment it stops being true.
 *
 * ## What it measured on `ea02b4d2`, which is why the lists below are not empty
 *
 * **Sixteen of the eighteen commands reach a real `<button>`**, through one,
 * two or three hops, and all sixteen bottom out on
 * `src/ui/primitives/action-button.ts` or `src/ui/primitives/toggle-group.ts`.
 *
 * **`Undo` and `Redo` reach no control at all**, and that is a finding rather
 * than a gap in the scan. Their only dispatch is
 * `dispatchCommand({ kind: direction })` in `src/ui/hud/hud.ts`, reached from
 * `BuildTool`'s `KeyZ`/`KeyY` bindings through `attachHistory`; `hud.ts` says
 * so in its own words at that line -- *"the player pressed a key on the world,
 * not a button in the HUD"*. So the pair is keyboard-only, which `hud.ts`
 * already records as the reason `RemoveObject` had to exist: *"undo is bound
 * to `KeyZ` and nothing else, so on a touch device a misplaced object was
 * permanent for the session."* A touch player can undo nothing.
 *
 * **`ReleaseGuardAssignment`'s only control is one the `#88` sweep never
 * presses.** It is built in the block that creates `hud-staff__held-row`, and
 * those rows are the three entries on that spec's
 * `NEVER_LAID_OUT_WITHOUT_A_HELD_GUARD` -- exempt because the sweep cannot put
 * the simulation into a state where a guard is *held*, which needs a tick. So
 * the command has a control, the control is in the inventory, and no pass has
 * ever pressed it. That is precisely the hole this file was written to make
 * visible, and it was invisible to both ends separately: the command gate sees
 * a producer, and the sweep sees a control it is allowed to skip.
 */

const ROOT = resolve(__dirname, '../..');

/**
 * Why a declared command reaches no DOM control.
 *
 * The reviewable half of the claim, exactly as `AWAITING_PRODUCER` is in the
 * command gate and `NEVER_LAID_OUT_BELOW_720` is in the sweep. An entry has to
 * say what is true today, and it fails as stale the moment the command gains
 * one.
 */
const NO_CONTROL_ISSUES_IT: Readonly<Record<string, string>> = {
  Undo:
    'Keyboard only, and deliberately so at the seam: the one dispatch is `dispatchCommand({ kind: direction })` ' +
    'in `src/ui/hud/hud.ts`, whose `direction` comes from `HudEditHistory.attachHistory` and so from `BuildTool`\'s ' +
    '`KeyZ` binding on the world. No HUD control calls it, `hud.ts` states that in the comment above the call, and ' +
    'the scan cannot see a computed kind in any case. It is on this list rather than silently absent because a ' +
    'command with no control is a command a touch player cannot issue -- which `hud.ts` itself gives as the reason ' +
    '`RemoveObject` had to be added, and that reason applies to this pair unanswered.',
  Redo:
    'The other half of the same key pair and the same seam: `KeyY` through `BuildTool.attachHistory` into the one ' +
    'computed-kind dispatch in `src/ui/hud/hud.ts`. Recorded separately rather than folded into `Undo` because the ' +
    'two are separate schema literals and separate `HudIntent` members, and a fix that gave one of them a control ' +
    'and not the other has to fail this list rather than pass it.',
};

/**
 * A command whose only control is one the `#88` sweep is allowed never to lay
 * out, and why.
 *
 * This is the half of the join neither end could state. The sweep's two
 * exemption lists are about *controls*; this list is about *commands*, and an
 * entry here says a press that the rest of the repository treats as gated is
 * in fact ungated.
 */
const SWEEP_NEVER_PRESSES_ITS_CONTROL: Readonly<Record<string, string>> = {
  ReleaseGuardAssignment:
    'Its only control is the `Release` button on a held-guard row: `src/ui/hud/staff-panel.ts` builds it in the ' +
    'same block that creates `hud-staff__held-row`, and those three rows are the whole of ' +
    '`app-shell.spec.ts`\'s `NEVER_LAID_OUT_WITHOUT_A_HELD_GUARD`. That constant\'s own comment says why they are ' +
    'exempt and it is not a layout decision: the sweep can *hire* -- one press -- but a guard becomes **held** only ' +
    'when `DeploymentSystem.assignUnassignedGuards` claims it, which runs from its `update` and so needs a tick, ' +
    'and the sweep holds the clock paused for the whole of its five viewports. So the row is in the inventory, is ' +
    'exempt at every viewport, and has never been pressed by that sweep at any width. Reachability of the press ' +
    'itself is measured elsewhere (`tests/browser/ui-pooled-rows-aim.spec.ts` aims the pooled row); what is ' +
    'unmeasured is that the control is laid out and clear of anything covering it, which is the sweep\'s question ' +
    'and not that spec\'s. Recorded rather than fixed: unexempting it needs the sweep to reach a state with a held ' +
    'guard, which is the sweep\'s own design and not this gate\'s to change.',
};

function collectTypeScript(directory: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) collectTypeScript(path, acc);
    else if (entry.endsWith('.ts')) acc.push(path);
  }
  return acc;
}

const sources: readonly ScannedSource[] = collectTypeScript(join(ROOT, 'src')).map((path) => ({
  file: relative(ROOT, path).split('\\').join('/'),
  // Stripped for the reason the command gate strips: this repository's prose
  // names these intents and commands in sentences *about* their reachability,
  // and an unstripped scan would read the sentence as the route.
  text: stripComments(readFileSync(path, 'utf8')),
}));

const uiSources = sources.filter((source) => source.file.startsWith('src/ui/'));
const mainSource = sources.find((source) => source.file === 'src/main.ts');

const COMMAND_TYPES: readonly string[] = simulationCommandSchema.options.map((option) => option.shape.type.value);

const SPEC = stripComments(readFileSync(join(ROOT, 'tests', 'browser', 'app-shell.spec.ts'), 'utf8'));

/**
 * `INTERACTIVE_SELECTOR` as the sweep declares it, read out of the spec rather
 * than copied.
 *
 * Load-bearing for the join: that selector *is* the sweep's inventory, so a
 * chain that bottoms out on an element it does not match is a producer no
 * amount of sweeping will ever press. `#903`'s minimap surface was exactly
 * that -- a `div` with an implicit `tabIndex -1` -- and it was found by a
 * person reading the two lists. Pinned so the tag list this gate checks
 * against cannot quietly stop being the list the sweep uses.
 */
const sweepSelector = /const INTERACTIVE_SELECTOR\s*=\s*\n?\s*'([^']+)'/.exec(SPEC)?.[1];

/**
 * The class tokens of the controls on one of the sweep's exemption lists.
 *
 * Parsed structurally rather than by pulling every quoted word out of the
 * constant: an entry is a `>`-separated ancestor chain ending in
 * `button.a-class another-class "Its label"`, and the label is a sentence.
 * Reading the label's words as class names put `the`, `map`, `is` and `yet`
 * into the set, any of which could collide with a real class name one day.
 */
function exemptClassTokens(constant: string): readonly string[] {
  const start = SPEC.indexOf(`const ${constant} = [`);
  if (start < 0) return [];
  const body = SPEC.slice(start, SPEC.indexOf('] as const;', start));
  const tokens = new Set<string>();
  for (const quoted of body.matchAll(/'([^']*)'/g)) {
    for (const segment of (quoted[1] ?? '').split('>')) {
      // Drop a trailing `"Label"` and a `#2` tie-breaker, then read what is
      // left: either a bare class list, or `tag.class class` for the leaf.
      const bare = segment.replace(/"[^"]*"/g, '').replace(/#\d+/g, '').trim();
      const classes = bare.includes('.') ? bare.slice(bare.indexOf('.') + 1) : bare;
      // At least one separator, and `[-_]+` rather than `[-_]`, because BEM's
      // element separator is a double underscore: the single-character
      // version rejected `hud-staff__held-row` and the whole cross-check
      // below then compared against nine structural class names and found
      // nothing, which is the vacuous pass the assertions on this set exist
      // to catch.
      for (const token of classes.split(/\s+/)) if (/^[a-z][a-z0-9]*(?:[-_]+[a-z0-9]+)+$/.test(token)) tokens.add(token);
    }
  }
  return [...tokens];
}

const exemptTokens = new Set([
  ...exemptClassTokens('NEVER_LAID_OUT_BELOW_720'),
  ...exemptClassTokens('NEVER_LAID_OUT_WITHOUT_A_HELD_GUARD'),
]);

/**
 * The intent kinds `src/main.ts` turns into one command.
 *
 * Read off the `case` clause each `type: 'X'` sits in rather than from a
 * written-down table, for the reason the command gate reads its list off
 * `simulationCommandSchema.options`: a table here would be a second list to
 * forget.
 */
function intentKindsFor(command: string): readonly string[] {
  if (mainSource === undefined) return [];
  const kinds = new Set<string>();
  for (const match of mainSource.text.matchAll(new RegExp(`\\btype\\s*:\\s*'${command}'`, 'g'))) {
    const clause = [...mainSource.text.slice(0, match.index).matchAll(/\bcase\s+'([a-z0-9-]+)'\s*:/g)].pop();
    if (clause !== undefined) kinds.add(clause[1] as string);
  }
  return [...kinds];
}

interface Verdict {
  readonly command: string;
  readonly intents: readonly string[];
  readonly routes: readonly Route[];
  /** The route that reaches a control, if any. */
  readonly control: Route | undefined;
  /** Exempt class tokens in that control's own neighbourhood. */
  readonly exemptClasses: readonly string[];
}

const verdicts: readonly Verdict[] = COMMAND_TYPES.map((command): Verdict => {
  const intents = intentKindsFor(command);
  const routes = intents.flatMap((intent) => routesForIntent(uiSources, intent));
  const control = routes.find((route) => route.outcome === 'control');
  return {
    command,
    intents,
    routes,
    control,
    exemptClasses: (control?.classes ?? []).filter((token) => exemptTokens.has(token)),
  };
});

const verdictFor = (command: string): Verdict => verdicts.find((verdict) => verdict.command === command) as Verdict;
const describeRoute = (route: Route | undefined): string =>
  route === undefined ? 'no route found' : `${route.outcome} at ${route.at}: ${route.trail.join(' -> ')}`;

/**
 * A hop's file, without its line.
 *
 * Every assertion below names files rather than `file:line`, and the lines are
 * carried only in the failure text. A line number asserted here would make
 * this gate go red when somebody adds a comment to a primitive, which is a
 * gate that trains a reader to edit the number -- and an edited number is how
 * a tally stops meaning anything. `docs/AGENT_WORKFLOW.md` section 4's
 * anchor-shift warning is the same hazard one document over.
 */
const fileOf = (hop: string): string => (hop.split(':')[0] as string);

describe('every declared command has a control the layout sweep can press, or is accounted for', () => {
  it('scans real sources and really finds the chains that exist', () => {
    // The vacuity guard, and it has four halves because four separate things
    // could quietly stop matching and leave the accounting below green on an
    // empty measurement: the file set, the schema, the `case` derivation and
    // the walk itself.
    expect(sources.length).toBeGreaterThan(50);
    expect(uiSources.length).toBeGreaterThan(20);
    expect(mainSource, 'the composition root moved; this gate reads the intent-to-command mapping out of it').toBeDefined();
    expect(COMMAND_TYPES.length).toBe(18);

    // Every command is reached from at least one `case` clause in the
    // composition root. A command whose clause disappeared would otherwise
    // have no intents, no routes, and be reported as producerless for the
    // wrong reason.
    expect(verdicts.filter((verdict) => verdict.intents.length === 0).map((verdict) => verdict.command)).toEqual([]);

    // Three chains of three different depths, named rather than counted, so a
    // walk that stopped resolving callback hops fails here with the shape of
    // the failure rather than only with a number. `DismissAlert` is one hop
    // (the alerts row builds its own button in `hud.ts`), `HireStaff` is two
    // (`hud.ts` -> `staff-panel.ts` -> the primitive) and `EditRegimeBlock` is
    // three and lands on a different primitive.
    expect(verdictFor('DismissAlert').control?.trail.map(fileOf)).toEqual([
      'src/ui/hud/hud.ts',
      'src/ui/primitives/action-button.ts',
    ]);
    expect(verdictFor('HireStaff').control?.trail.map(fileOf)).toEqual([
      'src/ui/hud/hud.ts',
      'src/ui/hud/staff-panel.ts',
      'src/ui/primitives/action-button.ts',
    ]);
    expect(verdictFor('EditRegimeBlock').control?.trail.map(fileOf)).toEqual([
      'src/ui/hud/hud.ts',
      'src/ui/hud/regime-panel.ts',
      'src/ui/primitives/toggle-group.ts',
    ]);
    // And the option names, which is the half a file list cannot carry: the
    // second hop of the regime chain is a *toggle group*, not the section
    // header of the same name one primitive over.
    expect(verdictFor('EditRegimeBlock').control?.trail.some((hop) => hop.includes('createToggleGroup({ onToggle })'))).toBe(true);
    expect(verdictFor('HireStaff').control?.trail.some((hop) => hop.includes('createStaffPanel({ onHire })'))).toBe(true);
  });

  it('reads the sweep\'s own selector, so the two ends are joined on the same definition of a control', () => {
    expect(
      sweepSelector,
      'app-shell.spec.ts no longer declares INTERACTIVE_SELECTOR as a single-quoted constant; this gate cannot join to an inventory it cannot read',
    ).toBe('button, [role="button"], a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    // Every tag this gate accepts as a control is a tag that selector matches.
    // The other way round is not asserted and must not be: the selector also
    // matches `[role="button"]` and `[tabindex]`, which the walk cannot read
    // off `element()` calls, so it is deliberately the stricter of the two.
    for (const tag of INTERACTIVE_TAGS) expect(sweepSelector, `the sweep no longer collects <${tag}>`).toContain(tag);
  });

  it('finds the exemption lists it cross-checks against, and reads class names out of them', () => {
    // Without this the cross-check below passes by comparing against an empty
    // set, which is the exact shape of the four failures this repository found
    // in one day: a green gate measuring nothing.
    expect(exemptTokens.size).toBeGreaterThan(8);
    expect([...exemptTokens]).toContain('hud-staff__held-row');
    expect([...exemptTokens]).toContain('hud__corner');
    // And the label words are *not* in it, which is what the structural parse
    // above buys. `the` and `map` come out of "No map is drawn here yet".
    expect([...exemptTokens]).not.toContain('the');
    expect([...exemptTokens]).not.toContain('map');
  });

  it('accounts for every command that reaches no control, with a reason', () => {
    const unreached = verdicts.filter((verdict) => verdict.control === undefined);
    const unlisted = unreached.filter((verdict) => NO_CONTROL_ISSUES_IT[verdict.command] === undefined);
    expect(
      unlisted.map((verdict) => `${verdict.command} [${verdict.intents.join(', ')}]: ${verdict.routes.map(describeRoute).join(' | ')}`),
      'a declared command that no DOM control in src/ui/ can issue. A command only a key chord or a test can send is a command a touch player does not have: give it a control, or record it in NO_CONTROL_ISSUES_IT with what is true about it today',
    ).toEqual([]);

    for (const [command, reason] of Object.entries(NO_CONTROL_ISSUES_IT)) {
      expect(reason.trim().length, `${command} needs a reason`).toBeGreaterThan(80);
    }
  });

  it('bottoms out on an element the sweep collects, never on a div with a handler', () => {
    // The join, stated as its own assertion. A chain that ends on a listener
    // attached to something `INTERACTIVE_SELECTOR` does not match is a
    // producer the sweep is structurally blind to -- #903's minimap surface
    // for ten months -- and it fails here rather than being reported as a
    // control.
    const blind = verdicts.flatMap((verdict) =>
      verdict.routes.filter((route) => route.outcome === 'non-interactive').map((route) => `${verdict.command}: ${describeRoute(route)}`),
    );
    expect(
      blind,
      'this command is issued from a DOM listener on an element app-shell.spec.ts\'s INTERACTIVE_SELECTOR does not match, so the #88 sweep will never collect or press it. Make it a real control (a <button>, as #903 did for the minimap surface) rather than exempting it here',
    ).toEqual([]);

    // And the positive half: every control route really did resolve a tag,
    // rather than being accepted because the tag read `undefined`.
    for (const verdict of verdicts) {
      if (verdict.control === undefined) continue;
      expect(INTERACTIVE_TAGS, `${verdict.command} bottoms out on an unresolved element`).toContain(verdict.control.tag);
    }
  });

  it('accounts for every command whose only control the sweep never presses', () => {
    const skipped = verdicts.filter((verdict) => verdict.exemptClasses.length > 0);
    const unlisted = skipped.filter((verdict) => SWEEP_NEVER_PRESSES_ITS_CONTROL[verdict.command] === undefined);
    expect(
      unlisted.map((verdict) => `${verdict.command}: built beside ${verdict.exemptClasses.join(', ')} -- ${describeRoute(verdict.control)}`),
      'this command\'s only control is built in the same block as a class on one of app-shell.spec.ts\'s exemption lists, so the #88 sweep is allowed never to lay it out and never to press it. Either drive the state that lays it out in that sweep, or record the command in SWEEP_NEVER_PRESSES_ITS_CONTROL with what is true about it today',
    ).toEqual([]);

    for (const [command, reason] of Object.entries(SWEEP_NEVER_PRESSES_ITS_CONTROL)) {
      expect(reason.trim().length, `${command} needs a reason`).toBeGreaterThan(80);
    }
  });

  it('holds no entry for a command that has since gained a control, or lost its exemption', () => {
    // The direction that makes each list a gate rather than a note. A record
    // of unreachability that outlives the fact is the failure mode
    // `docs/AGENT_WORKFLOW.md` section 4 names, and both lists here are
    // exactly the sentence shape it says rots first.
    const declared = new Set(COMMAND_TYPES);
    const withControl = new Set(verdicts.filter((verdict) => verdict.control !== undefined).map((verdict) => verdict.command));
    expect(
      Object.keys(NO_CONTROL_ISSUES_IT).filter((command) => declared.has(command) && withControl.has(command)),
      'these commands now have a DOM control: delete their NO_CONTROL_ISSUES_IT entries in the same change',
    ).toEqual([]);

    const skipped = new Set(verdicts.filter((verdict) => verdict.exemptClasses.length > 0).map((verdict) => verdict.command));
    expect(
      Object.keys(SWEEP_NEVER_PRESSES_ITS_CONTROL).filter((command) => declared.has(command) && !skipped.has(command)),
      'the #88 sweep now reaches these commands\' controls: delete their SWEEP_NEVER_PRESSES_ITS_CONTROL entries in the same change',
    ).toEqual([]);
  });

  it('still declares every command either list names', () => {
    const declared = new Set(COMMAND_TYPES);
    const gone = [...Object.keys(NO_CONTROL_ISSUES_IT), ...Object.keys(SWEEP_NEVER_PRESSES_ITS_CONTROL)].filter(
      (command) => !declared.has(command),
    );
    expect(
      gone,
      'a command one of these lists accounts for is no longer declared. Deleting an unreachable command is a legitimate outcome and the owner\'s call: if that is the decision, delete the entry in the same change',
    ).toEqual([]);
  });

  it('measures sixteen commands with a control, two with none, and one the sweep never presses', () => {
    // The denominators, stated so the gate reports facts rather than only
    // guarding them, and exact in both directions for the reason the command
    // gate gives: adding an entry to a list is a smaller act than changing a
    // number that says two of eighteen actions have no control at all.
    const withControl = verdicts.filter((verdict) => verdict.control !== undefined);
    expect(withControl.length).toBe(16);
    expect(COMMAND_TYPES.length - withControl.length).toBe(2);
    expect(verdicts.filter((verdict) => verdict.exemptClasses.length > 0).map((verdict) => verdict.command)).toEqual([
      'ReleaseGuardAssignment',
    ]);
    // All sixteen through the two primitives that build a `<button>`, which is
    // what makes the join a single fact rather than sixteen. A seventeenth
    // route arriving through a third primitive is a thing to look at, not a
    // thing to wave through.
    expect([...new Set(withControl.map((verdict) => fileOf(verdict.control?.at ?? '')))].sort()).toEqual([
      'src/ui/primitives/action-button.ts',
      'src/ui/primitives/toggle-group.ts',
    ]);
  });
});
