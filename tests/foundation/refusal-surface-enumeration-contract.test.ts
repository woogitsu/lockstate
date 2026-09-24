import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REFUSAL_REASONS } from '../../src/simulation/protocol/types';
import { simulationCommandSchema } from '../../src/simulation/protocol/commands';
import { refusalMessageKey } from '../../src/ui/hud/projection';
import { stripComments } from '../helpers/canonical-iteration';
import { routesForIntent, type ScannedSource } from '../helpers/control-reachability';

/**
 * **The enumeration issue #1160's criterion 4 was restated in terms of, and
 * the gate that keeps it from rotting.**
 *
 * `docs/IDENTITY_V5_ROLLOUT.md`'s stage 4 restated *"a browser spec per
 * refusal path"* per **surface**: one spec per `(press, success artifact,
 * producer)` triple, because what a browser uniquely adds over the 48-reason
 * unit loops in `tests/unit/ui-simulation-alerts.test.ts` is that the
 * **success artifact is absent** -- and that varies by surface rather than by
 * reason. It carried no count, deliberately, because no enumeration had been
 * performed. This file is the enumeration, and every column of it that the
 * code can answer is answered by the code here rather than by the table.
 *
 * ## The counting rule, stated so the number can be argued with
 *
 * - A **press** is a control, or a world gesture, that dispatches one command
 *   intent. One control in two modes is two presses when the two modes place
 *   different things: the Build panel's coordinate submit dispatches
 *   `place-build-order`, `place-object` or `remove-object` depending on the
 *   selected row and the remove toggle, and a wall order, a placed bed and a
 *   removed object are three different absences to prove.
 * - Three buttons that dispatch **one** intent with one artifact are **one**
 *   press: the transport strip's Pause, Play and Fast-forward all dispatch
 *   `set-clock` and all fail the same way.
 * - A **producer** is the side of `sender.submit` that decided the refusal:
 *   `host` when `src/main.ts` threw before submitting and `reportError`
 *   painted a `hud.refusal.*` sentence, `simulation` when the worker answered
 *   and `applySimulationRefusal` painted a `hud.alert.refusal.*` one. A press
 *   has a host triple exactly when `refusalMessageKey` answers for its intent,
 *   which this file asks the shipped function rather than writing down.
 *
 * ## What this file can and cannot settle
 *
 * It settles the **denominator** -- which triples exist -- against the code
 * that declares them. It cannot settle the numerator by itself: whether a
 * browser spec really drives a press is a fact about a Playwright file, so the
 * coverage column is checked the only way a browserless gate can check it, by
 * requiring the named spec to exist and to contain the exact assertion quoted
 * beside it. A spec renamed, deleted or rewritten past that line fails here.
 */

const ROOT = resolve(__dirname, '../..');
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8').replace(/\r\n/gu, '\n');

type Producer = 'host' | 'simulation';

interface Triple {
  /** The press, named by the control or gesture the player uses. */
  readonly press: string;
  /** The `HudIntent` kind that press dispatches. */
  readonly intent: string;
  /** The `simulationCommandSchema` literal it becomes, absent for a host-only intent. */
  readonly command?: string;
  /** What appears on success, and therefore what a browser spec must find missing. */
  readonly artifact: string;
  readonly producer: Producer;
  /**
   * How the walk in `tests/helpers/control-reachability.ts` reaches this
   * press: a callback-option hop for a panel control, or `'world'` for a
   * gesture that dispatches from `mountHud` scope with no control at all, or
   * `'keyboard'` for the undo pair.
   */
  readonly reach: string;
  /** The gate spec that drives this press against the assembled application. */
  readonly drivenBy?: { readonly spec: string; readonly quote: string };
  /** Whether that spec also asserts the success artifact is absent. */
  readonly provesAbsence?: { readonly quote: string };
}

/**
 * The enumeration.
 *
 * Ordered by press so the three-artifact presses read as one control, and
 * written as data rather than as prose so the assertions below can be
 * bidirectional: every row is checked against the code, and every thing the
 * code declares is checked for a row.
 */
const TRIPLES: readonly Triple[] = [
  // -- the Build panel's coordinate submit, three modes ---------------------
  {
    press: 'Build panel · ENTER COORDINATES · Place order (wall row selected)',
    intent: 'place-build-order',
    command: 'PlaceBuildOrder',
    artifact: 'a queued build order: the queue block appears and `data-queued` counts it',
    producer: 'simulation',
    reach: 'createBuildPanel({ onPlace })',
    drivenBy: {
      spec: 'tests/browser/app-shell.spec.ts',
      quote: "await expect(band).toHaveAttribute('data-source', 'simulation');",
    },
  },
  {
    press: 'Build panel · ENTER COORDINATES · Place order (wall row selected)',
    intent: 'place-build-order',
    command: 'PlaceBuildOrder',
    artifact: 'a queued build order: the queue block appears and `data-queued` counts it',
    producer: 'host',
    reach: 'createBuildPanel({ onPlace })',
    drivenBy: {
      spec: 'tests/browser/app-shell.spec.ts',
      quote: "await expect(refusal).toHaveAttribute('data-action', 'place-build-order');",
    },
  },
  {
    press: 'Build panel · ENTER COORDINATES · Place order (object row selected)',
    intent: 'place-object',
    command: 'PlaceObject',
    artifact: 'a placed object, and no queue row for it',
    producer: 'simulation',
    reach: 'createBuildPanel({ onPlace })',
    drivenBy: {
      spec: 'tests/browser/ui-build-refusal-is-not-a-success.spec.ts',
      quote: "await expect(band, 'and it is the simulation that answered').toHaveAttribute('data-source', 'simulation');",
    },
    provesAbsence: { quote: 'await expect(queued).toHaveCount(0);' },
  },
  {
    press: 'Build panel · ENTER COORDINATES · Place order (remove armed)',
    intent: 'remove-object',
    command: 'RemoveObject',
    artifact: 'the object is gone from the tile',
    producer: 'simulation',
    reach: 'createBuildPanel({ onPlace })',
  },

  // -- the world gestures ---------------------------------------------------
  {
    press: 'World · drag with the build tool armed',
    intent: 'place-build-order',
    command: 'PlaceBuildOrder',
    artifact: 'a queued build order for every edge the drag covered',
    producer: 'simulation',
    reach: 'world',
  },
  {
    press: 'World · drag with the build tool armed',
    intent: 'place-build-order',
    command: 'PlaceBuildOrder',
    artifact: 'a queued build order for every edge the drag covered',
    producer: 'host',
    reach: 'world',
    drivenBy: {
      spec: 'tests/browser/app-shell.spec.ts',
      quote: "test('a wall refused after a world drag says so on screen (#225)'",
    },
  },
  {
    press: 'World · press with the object tool armed to place',
    intent: 'place-object',
    command: 'PlaceObject',
    artifact: 'a placed object under the ghost',
    producer: 'simulation',
    reach: 'world',
  },
  {
    press: 'World · press with the object tool armed to remove, off an edge',
    intent: 'remove-object',
    command: 'RemoveObject',
    artifact: 'the object is gone from the tile',
    producer: 'simulation',
    reach: 'world',
  },
  {
    press: 'World · press with the object tool armed to remove, on an edge',
    intent: 'remove-object',
    command: 'RemoveWall',
    artifact: 'the wall segment is gone from the edge',
    producer: 'simulation',
    reach: 'world',
    drivenBy: {
      spec: 'tests/browser/app-shell.spec.ts',
      quote: "await expect(band).toContainText(localeText('hud.alert.refusal.remove-wall.nothing-to-remove'));",
    },
  },

  // -- the rest of the Build panel ------------------------------------------
  {
    press: 'Build panel · queue row · Cancel',
    intent: 'cancel-build-order',
    command: 'CancelBuildOrder',
    artifact: 'the order leaves the queue and `data-queued` falls',
    producer: 'simulation',
    reach: 'createBuildPanel({ onCancelOrder })',
  },
  {
    press: 'Build panel · queue row · Cancel',
    intent: 'cancel-build-order',
    command: 'CancelBuildOrder',
    artifact: 'the order leaves the queue and `data-queued` falls',
    producer: 'host',
    reach: 'createBuildPanel({ onCancelOrder })',
  },
  {
    press: 'Build panel · BUY · Buy',
    intent: 'purchase-materials',
    command: 'PurchaseMaterials',
    artifact: 'a pending delivery: `data-pending` on the deliveries block rises',
    producer: 'simulation',
    reach: 'createBuildPanel({ onPurchase })',
  },
  {
    press: 'Build panel · BUY · Buy',
    intent: 'purchase-materials',
    command: 'PurchaseMaterials',
    artifact: 'a pending delivery: `data-pending` on the deliveries block rises',
    producer: 'host',
    reach: 'createBuildPanel({ onPurchase })',
    drivenBy: {
      spec: 'tests/browser/app-shell.spec.ts',
      quote: "await expect(refusal).toHaveAttribute('data-action', 'purchase-materials');",
    },
    provesAbsence: { quote: 'expect(await purchasesSent(page)).toEqual([]);' },
  },
  {
    press: 'Build panel · delivery row · Cancel',
    intent: 'cancel-material-purchase',
    command: 'CancelMaterialPurchase',
    artifact: 'the delivery leaves the list and `data-pending` falls',
    producer: 'simulation',
    reach: 'createBuildPanel({ onCancelPurchase })',
  },
  {
    press: 'Build panel · delivery row · Cancel',
    intent: 'cancel-material-purchase',
    command: 'CancelMaterialPurchase',
    artifact: 'the delivery leaves the list and `data-pending` falls',
    producer: 'host',
    reach: 'createBuildPanel({ onCancelPurchase })',
  },
  {
    press: 'Build panel · BUY · Sell',
    intent: 'sell-materials',
    command: 'SellMaterials',
    artifact: 'stock falls and the funds readout rises',
    producer: 'simulation',
    reach: 'createBuildPanel({ onSell })',
  },
  {
    press: 'Build panel · BUY · Sell',
    intent: 'sell-materials',
    command: 'SellMaterials',
    artifact: 'stock falls and the funds readout rises',
    producer: 'host',
    reach: 'createBuildPanel({ onSell })',
  },

  // -- Zones ----------------------------------------------------------------
  {
    press: 'Zones panel · Designate',
    intent: 'zone-room',
    command: 'ZoneRoom',
    artifact: 'a zoned room: the rooms metric rises and the pending rectangle is consumed',
    producer: 'simulation',
    reach: 'createRoomsPanel({ onDesignate })',
  },
  {
    press: 'Zones panel · Designate',
    intent: 'zone-room',
    command: 'ZoneRoom',
    artifact: 'a zoned room: the rooms metric rises and the pending rectangle is consumed',
    producer: 'host',
    reach: 'createRoomsPanel({ onDesignate })',
  },
  {
    press: 'Zones panel · Remove',
    intent: 'unzone-room',
    command: 'UnzoneRoom',
    artifact: 'the room is gone and the rooms metric falls',
    producer: 'simulation',
    reach: 'createRoomsPanel({ onRemove })',
  },
  {
    press: 'Zones panel · Remove',
    intent: 'unzone-room',
    command: 'UnzoneRoom',
    artifact: 'the room is gone and the rooms metric falls',
    producer: 'host',
    reach: 'createRoomsPanel({ onRemove })',
  },

  // -- Manage ---------------------------------------------------------------
  {
    press: 'Intake panel · Admit',
    intent: 'admit-prisoner',
    command: 'AdmitPrisoner',
    artifact: 'a prisoner on the roster: the population metric rises',
    producer: 'simulation',
    reach: 'createIntakePanel({ onAdmit })',
  },
  {
    press: 'Intake panel · Admit',
    intent: 'admit-prisoner',
    command: 'AdmitPrisoner',
    artifact: 'a prisoner on the roster: the population metric rises',
    producer: 'host',
    reach: 'createIntakePanel({ onAdmit })',
  },
  {
    press: 'Intake panel · Accept candidate',
    intent: 'accept-intake-candidate',
    command: 'AcceptIntakeCandidate',
    artifact: 'the candidate leaves the board and joins the intake queue',
    producer: 'host',
    reach: 'createIntakePanel({ onAcceptCandidate })',
  },
  {
    press: 'Intake panel · Delay candidate',
    intent: 'delay-intake-candidate',
    command: 'DelayIntakeCandidate',
    artifact: 'the candidate remains on the board with delayed status',
    producer: 'host',
    reach: 'createIntakePanel({ onDelayCandidate })',
  },
  {
    press: 'Staff panel · Hire',
    intent: 'hire-staff',
    command: 'HireStaff',
    artifact: 'a staff member on the roster: the staff metric rises and funds fall',
    producer: 'simulation',
    reach: 'createStaffPanel({ onHire })',
  },
  {
    press: 'Staff panel · Hire',
    intent: 'hire-staff',
    command: 'HireStaff',
    artifact: 'a staff member on the roster: the staff metric rises and funds fall',
    producer: 'host',
    reach: 'createStaffPanel({ onHire })',
    drivenBy: {
      spec: 'tests/browser/app-shell.spec.ts',
      quote: "await expect(refusal).toHaveAttribute('data-action', 'hire-staff');",
    },
    provesAbsence: {
      quote: "expect(await hiresSent(page)).toEqual([]);\n    await expect(staffMetric).toHaveText('0');",
    },
  },
  {
    press: 'Staff panel · held-guard row · Release',
    intent: 'release-guard',
    command: 'ReleaseGuardAssignment',
    artifact: 'the guard leaves the held rows and returns to the pool',
    producer: 'simulation',
    reach: 'createStaffPanel({ onRelease })',
  },
  {
    press: 'Staff panel · held-guard row · Release',
    intent: 'release-guard',
    command: 'ReleaseGuardAssignment',
    artifact: 'the guard leaves the held rows and returns to the pool',
    producer: 'host',
    reach: 'createStaffPanel({ onRelease })',
  },
  {
    press: 'Staff panel · staff row · Dismiss (armed, then confirmed)',
    intent: 'dismiss-staff',
    command: 'DismissStaff',
    artifact: 'the row leaves the roster and the staff metric falls',
    producer: 'simulation',
    reach: 'createStaffPanel({ onDismiss })',
  },

  // -- Schedule -------------------------------------------------------------
  {
    press: 'Schedule panel · block toggle',
    intent: 'edit-regime-block',
    command: 'EditRegimeBlock',
    artifact: 'the block reads the chosen activity',
    producer: 'simulation',
    reach: 'createRegimePanel({ onEditBlock })',
  },

  // -- chrome that is still a command ---------------------------------------
  {
    press: 'Status strip · transport (Pause, Play, Fast-forward)',
    intent: 'set-clock',
    artifact: 'the clock reads what was asked and the tick readout moves',
    producer: 'host',
    reach: 'transportIntent',
    drivenBy: {
      spec: 'tests/browser/app-shell.spec.ts',
      quote: "await expect(refusal).toHaveAttribute('data-action', 'set-clock');",
    },
  },

  // -- the strip's Undo and Redo (#1356) -----------------------------------
  // Two presses, not one: they dispatch two intents with two different
  // artifacts, which is the rule the transport's three-buttons-one-press row
  // does not reach.
  {
    press: 'Status strip · Undo',
    intent: 'undo',
    command: 'Undo',
    artifact: 'the last gesture is taken back',
    producer: 'host',
    reach: 'createStatusStrip({ onUndo })',
    drivenBy: {
      spec: 'tests/browser/app-shell.spec.ts',
      quote: "await expect(refusal).toHaveAttribute('data-action', 'undo');",
    },
  },
  {
    press: 'Status strip · Redo',
    intent: 'redo',
    command: 'Redo',
    artifact: 'the taken-back gesture returns',
    producer: 'host',
    reach: 'createStatusStrip({ onRedo })',
    drivenBy: {
      spec: 'tests/browser/app-shell.spec.ts',
      quote: "await expect(refusal).toHaveAttribute('data-action', 'redo');",
    },
  },

  // -- the keyboard pair ----------------------------------------------------
  {
    press: 'Keyboard · KeyZ on the world',
    intent: 'undo',
    command: 'Undo',
    artifact: 'the last gesture is taken back',
    producer: 'host',
    reach: 'keyboard',
  },
  {
    press: 'Keyboard · KeyY on the world',
    intent: 'redo',
    command: 'Redo',
    artifact: 'the taken-back gesture returns',
    producer: 'host',
    reach: 'keyboard',
  },
];

/**
 * A press the walk finds, that dispatches a command, and that no triple
 * names -- with why there is nothing for a browser spec to prove about it.
 *
 * `dismiss-alert` is the whole list and it is here rather than absent because
 * a press with no refusal surface at all is a finding, not a gap in the table.
 */
const NO_REFUSAL_SURFACE: Readonly<Record<string, string>> = {
  DismissAlert:
    'The alerts row dismiss button. It is the one command intent that can reach neither producer: `refusalMessageKey` ' +
    'answers `undefined` for `dismiss-alert`, so a host refusal paints nothing, and no `RefusalReason` carries a ' +
    '`dismiss-alert.` prefix, so the worker has no sentence to send either. `src/main.ts` submits it through ' +
    '`commands?.submit` rather than `requireSimulation(commands).submit`, so with no worker it does not even throw. ' +
    'A browser spec here would have no refusal to find, which is why it is excluded from the enumeration rather than ' +
    'counted as owed.',
};

// ---------------------------------------------------------------------------
// What the code declares, read here rather than written down
// ---------------------------------------------------------------------------

const EN = read('src/content/default-locale-en.ts');
const PL = read('src/content/locale-pl.ts');

/** Declared keys with the given prefix: a `'key':` at the head of a line, never a mention of one in a comment. */
function declaredKeys(source: string, prefix: string): readonly string[] {
  const pattern = new RegExp(`^\\s*'(${prefix.replace(/\./g, '\\.')}[a-z0-9.-]+)'\\s*:`, 'gmu');
  return [...source.matchAll(pattern)].map((match) => match[1] as string).sort();
}

const reasonSuffixes = [...REFUSAL_REASONS].sort();
const alertKeys = declaredKeys(EN, 'hud.alert.refusal.');
const alertKeysPl = declaredKeys(PL, 'hud.alert.refusal.');
const hostKeys = declaredKeys(EN, 'hud.refusal.');
const hostKeysPl = declaredKeys(PL, 'hud.refusal.');

/** The command domain a `RefusalReason` belongs to: everything before its first dot. */
const domainOf = (reason: string): string => reason.slice(0, reason.indexOf('.'));
const REASON_DOMAINS = [...new Set(reasonSuffixes.map(domainOf))].sort();

const COMMAND_TYPES: readonly string[] = simulationCommandSchema.options.map((option) => option.shape.type.value);

/** Every intent kind `src/main.ts` turns into a command, read off the `case` clause each `type: 'X'` sits in. */
const MAIN = stripComments(read('src/main.ts'));
function intentKindsFor(command: string): readonly string[] {
  const kinds = new Set<string>();
  for (const match of MAIN.matchAll(new RegExp(`\\btype\\s*:\\s*'${command}'`, 'g'))) {
    const clause = [...MAIN.slice(0, match.index).matchAll(/\bcase\s+'([a-z0-9-]+)'\s*:/g)].pop();
    if (clause !== undefined) kinds.add(clause[1] as string);
  }
  return [...kinds];
}

function collectTypeScript(directory: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) collectTypeScript(path, acc);
    else if (entry.endsWith('.ts')) acc.push(path);
  }
  return acc;
}

const uiSources: readonly ScannedSource[] = collectTypeScript(join(ROOT, 'src', 'ui')).map((path) => ({
  file: relative(ROOT, path).split('\\').join('/'),
  text: stripComments(readFileSync(path, 'utf8')),
}));

const hostTriples = TRIPLES.filter((triple) => triple.producer === 'host');
const simulationTriples = TRIPLES.filter((triple) => triple.producer === 'simulation');
const pointerTriples = TRIPLES.filter((triple) => triple.reach !== 'keyboard');
const driven = TRIPLES.filter((triple) => triple.drivenBy !== undefined);
const proven = TRIPLES.filter((triple) => triple.provesAbsence !== undefined);

describe('the refusal surfaces issue #1160 criterion 4 is counted in', () => {
  it('reads the three vocabularies out of the code, and they are the sizes the plan records', () => {
    // The vacuity guard first: every count below is over a regular expression
    // against a source file, and a pattern that stopped matching would leave
    // the set comparisons passing over two empty sets.
    // #587 adds a storage-capacity refusal to the plan's historical 48.
    expect(reasonSuffixes.length).toBe(49);
    expect(alertKeys.length).toBe(49);
    expect(alertKeysPl.length).toBe(49);
    expect(hostKeys.length).toBe(18);
    expect(hostKeysPl.length).toBe(18);

    // Set-identical member for member, not merely equinumerous.
    expect(alertKeys).toEqual(reasonSuffixes.map((reason) => `hud.alert.refusal.${reason}`));
    expect(alertKeysPl).toEqual(alertKeys);
    expect(hostKeysPl).toEqual(hostKeys);

    // And the figure that circulated instead. 67 is how many *lines* of the
    // English catalogue mention the prefix, comments included; it is not a
    // count of keys, and this assertion is what keeps the two numbers from
    // ever being confused again by someone reaching for `grep -c`.
    const mentions = EN.split('\n').filter((line) => line.includes('hud.alert.refusal.')).length;
    expect(mentions).toBeGreaterThan(alertKeys.length);
  });

  it('finds sixteen command domains in the reason vocabulary, one of which no press can reach', () => {
    expect(REASON_DOMAINS.length).toBe(16);
    // `construction.materials-unfunded` is recorded by
    // `src/simulation/construction/handler.ts` from a tick, not from a
    // command: `JustInTimeMaterialsService` runs behind the construction rung
    // and no control dispatches it. So sixteen domains yield fifteen
    // press-borne ones, and the enumeration is smaller than the bound the
    // plan recorded for exactly this reason.
    expect(REASON_DOMAINS).toContain('construction');
    const reached = new Set(
      simulationTriples.map((triple) => domainOf(reasonSuffixes.find((reason) => reason.startsWith(`${commandDomain(triple)}.`)) ?? '')),
    );
    expect([...reached].sort()).toEqual(REASON_DOMAINS.filter((domain) => domain !== 'construction'));
  });

  it('agrees with the shipped refusalMessageKey about which presses have a host producer', () => {
    // The bidirectional half, and the one that makes this a gate rather than
    // a note: a new `case` in `refusalMessageKey` with no row here fails, and
    // a row here whose intent lost its sentence fails too.
    for (const triple of hostTriples) {
      expect(refusalMessageKey(triple.intent), `${triple.intent} has a host row but no host sentence`).toBeDefined();
    }
    for (const triple of simulationTriples) {
      const hasHostRow = hostTriples.some((other) => other.intent === triple.intent && other.press === triple.press);
      if (refusalMessageKey(triple.intent) !== undefined) {
        expect(hasHostRow, `${triple.press} can be host-refused and says so, but has no host row`).toBe(true);
      }
    }
    const intentsWithHostRows = new Set(hostTriples.map((triple) => triple.intent));
    expect([...intentsWithHostRows].sort()).toEqual([
      'accept-intake-candidate',
      'admit-prisoner',
      'cancel-build-order',
      'cancel-material-purchase',
      'delay-intake-candidate',
      'hire-staff',
      'place-build-order',
      'purchase-materials',
      'redo',
      'release-guard',
      'sell-materials',
      'set-clock',
      'undo',
      'unzone-room',
      'zone-room',
    ]);
  });

  it('names the command intents a host refusal reaches no surface for', () => {
    // The finding this enumeration turned up, kept as an assertion so it
    // cannot quietly change. Each of these dispatches a command through
    // `requireSimulation`, which throws with no worker -- and
    // `refusalMessageKey` answers `undefined`, so `reportError` paints
    // nothing at all and the press reads as having done something.
    const silent = [...new Set(TRIPLES.map((triple) => triple.intent))]
      .filter((intent) => refusalMessageKey(intent) === undefined)
      .sort();
    expect(silent).toEqual(['dismiss-staff', 'edit-regime-block', 'place-object', 'remove-object']);
    for (const intent of silent) {
      expect(MAIN, `${intent} no longer dispatches a command`).toContain(`case '${intent}':`);
    }
  });

  it('accounts for every declared command, in the table or on the excluded list', () => {
    const inTable = new Set(TRIPLES.flatMap((triple) => (triple.command === undefined ? [] : [triple.command])));
    const unaccounted = COMMAND_TYPES.filter(
      (command) => !inTable.has(command) && NO_REFUSAL_SURFACE[command] === undefined,
    );
    expect(
      unaccounted,
      'a declared command with no refusal triple and no entry saying why: add its press to TRIPLES, or record it in NO_REFUSAL_SURFACE',
    ).toEqual([]);

    const stale = Object.keys(NO_REFUSAL_SURFACE).filter((command) => inTable.has(command) || !COMMAND_TYPES.includes(command));
    expect(stale, 'this command now has a triple, or is no longer declared: delete its NO_REFUSAL_SURFACE entry').toEqual([]);
    for (const [command, reason] of Object.entries(NO_REFUSAL_SURFACE)) {
      expect(reason.trim().length, `${command} needs a reason`).toBeGreaterThan(80);
    }

    // And every excluded command really does reach neither producer, which is
    // the claim its entry makes. Asked of the code, not of the sentence.
    for (const command of Object.keys(NO_REFUSAL_SURFACE)) {
      for (const intent of intentKindsFor(command)) {
        expect(refusalMessageKey(intent), `${command} gained a host sentence`).toBeUndefined();
        expect(reasonSuffixes.filter((reason) => reason.startsWith(`${intent}.`)), `${command} gained a reason`).toEqual([]);
      }
    }
  });

  it('reaches every panel press through the reachability walk, on the walk\'s own answer', () => {
    // The press column is not written down twice. Every row whose press is a
    // panel control names the callback hop `control-reachability.ts` resolves
    // for it, and the walk is re-run here: a panel option renamed, or a
    // control that stops being a `<button>`, fails here rather than leaving a
    // table describing a route that no longer exists.
    const panel = TRIPLES.filter((triple) => !['world', 'keyboard', 'transportIntent'].includes(triple.reach));
    expect(panel.length).toBeGreaterThan(20);
    for (const triple of panel) {
      const routes = routesForIntent(uiSources, triple.intent);
      const control = routes.find((route) => route.outcome === 'control');
      expect(control, `${triple.intent} no longer reaches a control`).toBeDefined();
      expect(
        control?.trail.some((hop) => hop.includes(triple.reach)),
        `${triple.press}: the walk no longer reaches ${triple.reach}; its trail is ${control?.trail.join(' -> ') ?? 'empty'}`,
      ).toBe(true);
    }

    // The world gestures are the other shape and are checked as that shape:
    // a dispatch at `mountHud` scope with no control, which is what "the
    // player pressed the world, not a button" means mechanically.
    for (const triple of TRIPLES.filter((entry) => entry.reach === 'world')) {
      const routes = routesForIntent(uiSources, triple.intent);
      expect(
        routes.some((route) => route.outcome === 'no-control' && route.trail.some((hop) => hop.includes('function:mountHud'))),
        `${triple.press}: no world-gesture dispatch for ${triple.intent} at mountHud scope`,
      ).toBe(true);
    }

    // And the key pair is still the shape it was: a computed-kind dispatch the
    // walk cannot see, so every route the walk finds for `undo` and `redo` is
    // the strip's button and none is the key. This read "the undo pair still
    // reaches nothing" until #1356 gave the pair its buttons; the key rows are
    // kept because the key is still a press, and it is still the one the
    // second of the two defensible totals below leaves out.
    const hud = stripComments(read('src/ui/hud/hud.ts'));
    expect(hud, 'the keys no longer dispatch through the computed-kind seam').toContain(
      'dispatchCommand({ kind: direction });',
    );
    for (const triple of TRIPLES.filter((entry) => entry.reach === 'keyboard')) {
      const routes = routesForIntent(uiSources, triple.intent);
      expect(routes.length, `${triple.intent} has no route at all`).toBeGreaterThan(0);
      for (const route of routes) {
        expect(
          route.trail.some((hop) => hop.includes('createStatusStrip(')),
          `${triple.intent} gained a route that is not the strip's: ${route.trail.join(' -> ')}`,
        ).toBe(true);
      }
    }
  });

  it('holds no duplicate triple: a press, an artifact and a producer name one row', () => {
    const keys = TRIPLES.map((triple) => `${triple.press}||${triple.artifact}||${triple.producer}`);
    expect(new Set(keys).size).toBe(TRIPLES.length);
  });

  it('counts the enumeration, and the two totals that differ over the keyboard pair', () => {
    // 32 / 30 / 14 / 21 until #1356 added the strip's Undo and Redo rows.
    expect(TRIPLES.length).toBe(36);
    expect(pointerTriples.length).toBe(34);
    expect(simulationTriples.length).toBe(18);
    expect(hostTriples.length).toBe(18);
    expect(simulationTriples.length + hostTriples.length).toBe(TRIPLES.length);
    // Twenty-three distinct presses, of which twenty-one a pointer can make.
    expect(new Set(TRIPLES.map((triple) => triple.press)).size).toBe(25);
  });

  it('checks every coverage claim against the spec file that is supposed to carry it', () => {
    expect(driven.length).toBe(10);
    expect(proven.length).toBe(3);
    for (const triple of TRIPLES) {
      if (triple.drivenBy === undefined) {
        expect(triple.provesAbsence, `${triple.press} claims an absence assertion with no spec`).toBeUndefined();
        continue;
      }
      const spec = read(triple.drivenBy.spec);
      expect(spec, `${triple.drivenBy.spec} no longer contains the assertion this row rests on`).toContain(
        triple.drivenBy.quote,
      );
      if (triple.provesAbsence !== undefined) {
        expect(spec, `${triple.drivenBy.spec} no longer proves the success artifact absent`).toContain(
          triple.provesAbsence.quote,
        );
      }
    }
    // The number owed, derived rather than typed: a triple is owed a spec
    // until one drives its press and finds its artifact missing.
    expect(TRIPLES.length - proven.length).toBe(33);
    expect(pointerTriples.length - proven.filter((triple) => triple.reach !== 'keyboard').length).toBe(31);
  });

  it('is the number the rollout plan states, so the document cannot drift from the table', () => {
    const plan = read('docs/IDENTITY_V5_ROLLOUT.md');
    const section = plan.slice(plan.indexOf('### The enumeration criterion 4 was restated in terms of'));
    expect(section.length, 'the stage 4 enumeration subsection was renamed or removed').toBeGreaterThan(500);
    for (const figure of ['34', '32', '31', '29', '18', '16', '23']) {
      expect(section, `the plan no longer states ${figure}`).toContain(figure);
    }
  });
});

/** The reason-id domain a triple's command belongs to, by the prefix its refusal map uses. */
function commandDomain(triple: Triple): string {
  const byCommand: Readonly<Record<string, string>> = {
    PlaceBuildOrder: 'build',
    PlaceObject: 'place-object',
    RemoveObject: 'remove-object',
    RemoveWall: 'remove-wall',
    CancelBuildOrder: 'cancel-build-order',
    PurchaseMaterials: 'purchase',
    CancelMaterialPurchase: 'cancel-purchase',
    SellMaterials: 'sell',
    ZoneRoom: 'zone',
    UnzoneRoom: 'unzone',
    AdmitPrisoner: 'admit',
    HireStaff: 'hire',
    ReleaseGuardAssignment: 'release-guard',
    DismissStaff: 'dismiss',
    EditRegimeBlock: 'edit-regime-block',
  };
  return byCommand[triple.command ?? ''] ?? '';
}
