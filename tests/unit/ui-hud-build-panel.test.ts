import { describe, expect, it } from 'vitest';
import { SIMULATION_ENUM_GROUPS, deriveSimulationMessageKey, type SimulationEnumGroup } from '../../src/content';
import { Localizer, buildMessageCatalog, defaultMessageCatalogEn } from '../../src/services/localization';
import { BUILD_EDGES, DEFAULT_BUILD_EDGE } from '../../src/simulation/construction';
import {
  BUILD_CATEGORY_ALL,
  BUILD_QUEUE_ROW_LIMIT,
  PENDING_DELIVERY_ROW_LIMIT,
  buildCatalogueFocusRing,
  buildCategoryOptions,
  buildEdgeChoiceOptions,
  edgeChooserShown,
  formatBuildQueueOrderText,
  formatBuildTargetText,
  formatPendingDeliveryText,
  intentEdge,
  visibleBuildableIds,
} from '../../src/ui/hud/build-panel';
import { HUD_MESSAGE_KEYS } from '../../src/ui/hud/messages';
import { rovingFocusMove } from '../../src/ui/primitives/roving-focus';
import {
  HUD_BUILD_EDGES,
  HUD_BUILD_ORDER_STATES,
  HUD_DEFAULT_BUILD_EDGE,
  type HudBuildEdge,
  type HudBuildableViewModel,
  type HudBuildOrderViewModel,
  type HudPendingDeliveryViewModel,
} from '../../src/ui/hud/view-model';
import { PENDING_BUILD_ORDER_STATES } from '../../src/simulation/presentation/construction-projection';

/**
 * The HUD may not import `src/simulation/**` (`AGENTS.md` boundary 1), so
 * `HudBuildEdge` is a second declaration of the same vocabulary. Two
 * declarations of one thing drift; a *test* is allowed to import both, so
 * this is where they are held together.
 *
 * If the simulation ever gains a third edge slot, this fails and names the
 * HUD as the thing that has not been updated -- rather than the HUD quietly
 * being unable to express it.
 */
describe('the HUD edge vocabulary matches the simulation', () => {
  it('declares exactly the same members, in the same order', () => {
    expect([...HUD_BUILD_EDGES]).toEqual([...BUILD_EDGES]);
  });

  it('can express the simulation default', () => {
    expect(HUD_BUILD_EDGES as readonly string[]).toContain(DEFAULT_BUILD_EDGE);
  });

  /**
   * Stronger than the assertion above it, and kept beside it rather than in
   * place of it: `toContain` says the HUD *can* name the default, and this says
   * it names the same one. It matters from #531 onward because
   * `HUD_DEFAULT_BUILD_EDGE` became the value an intent carries when the
   * chooser is hidden -- a HUD default that drifted from the simulation's would
   * put an edge on a command that `resolveBuildEdge` resolves differently.
   */
  it('defaults to the edge the simulation defaults to', () => {
    expect(HUD_DEFAULT_BUILD_EDGE).toBe(DEFAULT_BUILD_EDGE);
  });
});

/**
 * **What a hidden control may contribute to a command: nothing** (issue #531).
 *
 * The panel keeps one retained `edge` for the life of the mount, so that coming
 * back to an edge buildable finds the orientation you last used. `readSelection`
 * read that value unconditionally while `paintPlacement` decided separately
 * whether the control holding it was on screen -- two spellings of one rule,
 * and the pair disagreed. A row whose chooser was hidden submitted whatever the
 * last *visible* choice had been, with the player shown no control and given no
 * way to change it.
 *
 * `door-wooden` is how that became visible, and the fix for the door itself is
 * in `src/main.ts` rather than here: with the composition root publishing
 * `occupiesTileEdge`, a door's chooser is shown and its edge is a real choice.
 * These two functions are the independent half -- they stop the *next* buildable
 * that takes the `place-build-order` route with no chooser from inheriting an
 * edge the same way.
 *
 * Exported and pure for the reason the formatters below are: the default Vitest
 * environment is `node` (`docs/TESTING.md`), so nothing headless can call
 * `createBuildPanel`, and "what the panel submits" has to be assertable without
 * a DOM. Whether the control's box is actually hidden is a browser question and
 * is measured in `tests/browser/ui-shell.spec.ts`.
 */
describe('the edge chooser and the edge a command carries agree', () => {
  const row = (occupiesEdge: boolean): HudBuildableViewModel => ({
    definitionId: occupiesEdge ? 'wall-brick' : 'bed-wooden',
    labelKey: 'content.buildable',
    occupiesEdge,
    placesObject: !occupiesEdge,
    categoryId: 'structure',
    categoryLabelKey: 'category.structure',
  });

  /** An edge that is not the default, so a fallback to the default is visible. */
  const CHOSEN = HUD_BUILD_EDGES.find((candidate) => candidate !== HUD_DEFAULT_BUILD_EDGE);

  it('has a non-default edge to test with, or the assertions below prove nothing', () => {
    // This suite's own guard against a one-member vocabulary: every "falls back
    // to the default" assertion would pass vacuously if the only edge there is
    // were the default one.
    expect(CHOSEN, 'HUD_BUILD_EDGES has no member other than the default').toBeDefined();
  });

  it('shows the chooser for a buildable that sits on an edge', () => {
    expect(edgeChooserShown(row(true), false)).toBe(true);
  });

  it('hides it for a buildable that does not', () => {
    expect(edgeChooserShown(row(false), false)).toBe(false);
  });

  it('hides it while removing, whatever is selected', () => {
    // What goes is whatever is on the tile, so a removal has no orientation to
    // offer -- the same reason it has no buildable.
    expect(edgeChooserShown(row(true), true)).toBe(false);
    expect(edgeChooserShown(row(false), true)).toBe(false);
  });

  it('hides it when nothing is selected', () => {
    expect(edgeChooserShown(undefined, false)).toBe(false);
  });

  it('carries the choice the player made while the chooser is shown', () => {
    expect(intentEdge(row(true), false, CHOSEN as HudBuildEdge)).toBe(CHOSEN);
  });

  it('carries the default, not the retained value, when the chooser is hidden', () => {
    // The defect, stated as a property: the retained edge is `CHOSEN` because
    // some earlier *visible* choice set it, and this row's chooser is not on
    // screen. Reading it back out would put a setting the player cannot see on
    // a command.
    expect(intentEdge(row(false), false, CHOSEN as HudBuildEdge)).toBe(HUD_DEFAULT_BUILD_EDGE);
  });

  it('carries the default for a removal, whatever is selected', () => {
    expect(intentEdge(row(true), true, CHOSEN as HudBuildEdge)).toBe(HUD_DEFAULT_BUILD_EDGE);
    expect(intentEdge(undefined, true, CHOSEN as HudBuildEdge)).toBe(HUD_DEFAULT_BUILD_EDGE);
  });

  it('resolves to an edge in every case rather than refusing', () => {
    // Deliberate, and the reason is a player rather than a type: a refusal here
    // would strand someone who has already been charged for materials. Every
    // consumer of an intent whose chooser is hidden ignores the field anyway --
    // `hud.ts` dispatches `remove-object` or `place-object`, neither of which
    // carries an edge -- so the field keeps one shape and stops carrying
    // history.
    for (const buildable of [row(true), row(false), undefined]) {
      for (const removing of [true, false]) {
        expect(HUD_BUILD_EDGES as readonly string[]).toContain(
          intentEdge(buildable, removing, CHOSEN as HudBuildEdge),
        );
      }
    }
  });

  it('never contradicts the control the panel painted', () => {
    // The invariant the two functions exist to hold, over every combination:
    // the intent carries the retained value exactly when the control holding it
    // is on screen. An implementation that read the retained edge
    // unconditionally fails here, and so does one that always sent the default.
    for (const buildable of [row(true), row(false), undefined]) {
      for (const removing of [true, false]) {
        const shown = edgeChooserShown(buildable, removing);
        expect(intentEdge(buildable, removing, CHOSEN as HudBuildEdge), `shown=${shown}`).toBe(
          shown ? CHOSEN : HUD_DEFAULT_BUILD_EDGE,
        );
      }
    }
  });
});

/**
 * `BUILD_EDGES` is player-facing *because* the Build panel exists: the player
 * picks an edge before placing a wall. PR #72's completeness gate therefore
 * requires it to be labelled rather than exempted, and these are the
 * properties that keep the labelling honest once it is.
 */
describe('the edge choices are labelled through the simulation enum catalog', () => {
  const group: SimulationEnumGroup | undefined = (SIMULATION_ENUM_GROUPS as readonly SimulationEnumGroup[]).find(
    (entry) => entry.namespace === 'build-edge',
  );

  it('has a group covering the declaration the gate discovers', () => {
    expect(group, 'no build-edge group; the completeness gate would fail').toBeDefined();
    expect(group?.sourceFile).toBe('src/simulation/construction/build-order.ts');
    expect(group?.declaration).toBe('BUILD_EDGES');
    // No `additionalIds`: every edge the panel offers is one the simulation
    // declares, so the escape hatch has nothing to cover.
    expect(group?.additionalIds).toBeUndefined();
  });

  it('labels exactly the edges the simulation declares, with no exemption', () => {
    expect(Object.keys(group?.labels ?? {})).toEqual([...BUILD_EDGES]);
  });

  it('resolves each derived key to real text rather than to the key itself', () => {
    const localizer = new Localizer({ locale: 'en', catalogs: [defaultMessageCatalogEn] });
    for (const edge of BUILD_EDGES) {
      const key = deriveSimulationMessageKey('build-edge', edge);
      expect(key).toBe(`build-edge.${edge}.name`);
      expect(localizer.format(key), `${key} is unresolved`).not.toBe(key);
    }
  });

  it('keeps no second, hand-authored copy of the same labels in the HUD registry', () => {
    // Two tables of the same two words drift. The panel derives its option
    // labels from the enum group, so a per-edge `hud.build.edge-*` key would
    // be a label nothing keeps in step with the simulation.
    expect(HUD_MESSAGE_KEYS.filter((key) => /^hud\.build\.edge-/.test(key))).toEqual([]);
  });
});

/**
 * What the panel actually *says* for each edge.
 *
 * ## What this replaces, and why a substring was not enough
 *
 * The check here used to be a `readFileSync` of `build-panel.ts` asserting the
 * source contained `deriveSimulationMessageKey('build-edge'`. It read the
 * implementation rather than running it, so it constrained the file's text and
 * nothing about its behaviour. This body satisfies it completely:
 *
 * ```ts
 * function edgeLabelKey(edge: HudBuildEdge): LocalizationKey {
 *   void deriveSimulationMessageKey('build-edge', edge);
 *   return 'build-edge.north.name';
 * }
 * ```
 *
 * Every edge then renders the North label -- the West option reads "North" and
 * so does the target readout after a click on a west edge -- and the suite
 * stays green, because the required substring is still on the page and the HUD
 * still imports no simulation module.
 *
 * ## Why this is not a DOM test
 *
 * The default Vitest environment is `node` and there is no DOM library in the
 * project (`docs/TESTING.md`: rendered-output claims belong to
 * `tests/browser/**`), so `createBuildPanel` cannot be called from here at
 * all. What the mutation breaks is not layout, it is the id-to-label mapping
 * the builders are handed -- the class of claim `docs/TESTING.md` puts
 * headlessly in `tests/unit/ui-*.test.ts` -- so `build-panel.ts` exposes that
 * mapping as the two pure functions the DOM code itself calls, and they are
 * run here against real catalogs. Both call sites are covered because the
 * damage differs between them: a wrong option label is visible beside the
 * right one, while a wrong readout is a single plausible-looking string.
 *
 * ## Why the sentinels are written out
 *
 * A fixture that computed its expectation with `deriveSimulationMessageKey`
 * would supply both sides of the comparison and hold for any implementation.
 * The two sentinel strings below are literals, and so are the strings expected
 * from them.
 *
 * ## The import boundary
 *
 * Dropping the source scan does not drop ADR 0011's boundary with it:
 * `tests/unit/ui-hud-messages.test.ts` ("imports nothing from the simulation")
 * already applies that rule to every file under `src/ui/hud/**` and
 * `src/ui/primitives/**`, over comment-stripped source -- strictly stronger
 * than the one-file, comment-blind copy that lived here. That gate owns it.
 */
describe('the panel labels each edge with that edge', () => {
  /**
   * Deliberately not the shipped catalog: north and west resolve to text that
   * could not come from anywhere else, and the two readout templates are
   * skeletal so the expected strings below can be written out in full.
   */
  const sentinels = buildMessageCatalog('en', {
    'build-edge.north.name': 'EDGE-NORTH-SENTINEL',
    'build-edge.west.name': 'EDGE-WEST-SENTINEL',
    'hud.build.target-none': 'NO-TARGET-SENTINEL',
    'hud.build.target-value': 'value/{x}/{y}/{edge}',
    'hud.build.target-run': 'run/{count}/{x}/{y}/{edge}',
  });
  const sentinelLocalizer = new Localizer({ locale: 'en', catalogs: [sentinels] });
  const t = (key: Parameters<Localizer['format']>[0], parameters?: Parameters<Localizer['format']>[1]): string =>
    parameters === undefined ? sentinelLocalizer.format(key) : sentinelLocalizer.format(key, parameters);

  it('gives each choice its own edge label rather than one label twice', () => {
    expect(buildEdgeChoiceOptions(t)).toEqual([
      { id: 'north', label: 'EDGE-NORTH-SENTINEL' },
      { id: 'west', label: 'EDGE-WEST-SENTINEL' },
    ]);
  });

  it('reads back the edge the pointer is actually aimed at', () => {
    expect(formatBuildTargetText(t, { x: 18, y: 15, edge: 'west', segments: 1 })).toBe(
      'value/18/15/EDGE-WEST-SENTINEL',
    );
    expect(formatBuildTargetText(t, { x: 18, y: 15, edge: 'north', segments: 1 })).toBe(
      'value/18/15/EDGE-NORTH-SENTINEL',
    );
  });

  it('reads back the edge of a run, which is the shape a drag produces', () => {
    expect(formatBuildTargetText(t, { x: 4, y: 7, edge: 'west', segments: 4 })).toBe('run/4/4/7/EDGE-WEST-SENTINEL');
    expect(formatBuildTargetText(t, { x: 4, y: 7, edge: 'north', segments: 4 })).toBe('run/4/4/7/EDGE-NORTH-SENTINEL');
  });

  it('says nothing about an edge when the pointer is aimed at nothing', () => {
    expect(formatBuildTargetText(t, undefined)).toBe('NO-TARGET-SENTINEL');
  });

  /**
   * The sentinel templates above are invented, so on their own they would not
   * notice a shipped `hud.build.target-*` string that stopped interpolating
   * `{edge}` -- the readout would go back to being the same text for both
   * edges, which is the defect this file is about, arriving through the
   * catalog instead of through the panel. Asserted as a difference rather than
   * against transcribed English, because the wording is content's to change.
   */
  it('produces a different readout per edge with the strings that actually ship', () => {
    const shipped = new Localizer({ locale: 'en', catalogs: [defaultMessageCatalogEn] });
    const format = (key: Parameters<Localizer['format']>[0], parameters?: Parameters<Localizer['format']>[1]): string =>
      parameters === undefined ? shipped.format(key) : shipped.format(key, parameters);
    for (const segments of [1, 4]) {
      const north = formatBuildTargetText(format, { x: 18, y: 15, edge: 'north', segments });
      const west = formatBuildTargetText(format, { x: 18, y: 15, edge: 'west', segments });
      expect(north, `the ${segments}-segment readout drops the edge`).not.toBe(west);
      expect(north).toContain(shipped.format('build-edge.north.name'));
      expect(west).toContain(shipped.format('build-edge.west.name'));
    }
  });

  it('offers exactly the edges the HUD declares, in that order', () => {
    // Pairs with the label assertion above: two right labels on the wrong set
    // of ids is still a wrong chooser.
    expect(buildEdgeChoiceOptions(t).map((option) => option.id)).toEqual([...HUD_BUILD_EDGES]);
  });
});

/**
 * The second vocabulary the HUD has to re-declare, and the same argument as
 * `HUD_BUILD_EDGES` above: the HUD may not import `src/simulation/**`
 * (`AGENTS.md` boundary 1), so `HudBuildOrderState` is a second declaration of
 * `PENDING_BUILD_ORDER_STATES`. Two declarations of one thing drift; a *test* is
 * allowed to import both, so this is where they are held together.
 *
 * It matters more here than for the edges. A member the HUD cannot express is a
 * queued order whose row says nothing about what it is waiting for -- or, if the
 * two lists disagree about *order*, a row that says a wall is being built when it
 * is waiting for brick.
 */
describe('the HUD build-order-state vocabulary matches the projection', () => {
  it('declares exactly the same members, in the same order', () => {
    expect([...HUD_BUILD_ORDER_STATES]).toEqual([...PENDING_BUILD_ORDER_STATES]);
  });

  it('names no terminal state, because a queue holds what is still coming', () => {
    for (const terminal of ['completed', 'cancelled', 'failed']) {
      expect(HUD_BUILD_ORDER_STATES as readonly string[]).not.toContain(terminal);
    }
  });
});

/**
 * The queue rows are labelled through the simulation enum catalog, exactly as
 * the edge choices are, and the group already existed: `build-order-state`
 * covers all eight members of `BuildOrderLifecycleState`. What is new is that
 * something *renders* it -- the group was authored and unread -- so these are the
 * properties that keep it honest now that it is on screen.
 */
describe('a queued order says what it is waiting for, in the simulation catalog\'s own words', () => {
  const group: SimulationEnumGroup | undefined = (SIMULATION_ENUM_GROUPS as readonly SimulationEnumGroup[]).find(
    (entry) => entry.namespace === 'build-order-state',
  );

  it('has a group covering the declaration the panel derives from', () => {
    expect(group, 'no build-order-state group; the queue rows would render raw dotted keys').toBeDefined();
    expect(group?.sourceFile).toBe('src/simulation/construction/build-order.ts');
    expect(group?.declaration).toBe('BuildOrderLifecycleState');
  });

  it('labels every state a queue row can hold, which is the subset the projection emits', () => {
    for (const state of PENDING_BUILD_ORDER_STATES) {
      expect(Object.keys(group?.labels ?? {}), `${state} has no label`).toContain(state);
    }
  });

  it('resolves each derived key to real text rather than to the key itself', () => {
    const localizer = new Localizer({ locale: 'en', catalogs: [defaultMessageCatalogEn] });
    for (const state of PENDING_BUILD_ORDER_STATES) {
      const key = deriveSimulationMessageKey('build-order-state', state);
      expect(key).toBe(`build-order-state.${state}.name`);
      expect(localizer.format(key), `${key} is unresolved`).not.toBe(key);
    }
  });

  it('gives each state its own words, so two rows waiting for different things do not read the same', () => {
    // The defect this guards is a catalogue that labels five states with one
    // word: "Awaiting materials" and "Awaiting the crew" are the two a player
    // acts on differently -- one is fixed by buying brick and one by waiting.
    const localizer = new Localizer({ locale: 'en', catalogs: [defaultMessageCatalogEn] });
    const rendered = PENDING_BUILD_ORDER_STATES.map((state) =>
      localizer.format(deriveSimulationMessageKey('build-order-state', state)),
    );
    expect(new Set(rendered).size).toBe(PENDING_BUILD_ORDER_STATES.length);
  });
});

describe('a queued row names its own order', () => {
  /**
   * Sentinels rather than the shipped catalog, for the reason the edge readout
   * uses them: the expected strings below can then be written out in full, and
   * the template is skeletal enough that a dropped field is visible.
   */
  const sentinels = buildMessageCatalog('en', {
    'build-edge.north.name': 'EDGE-NORTH-SENTINEL',
    'build-edge.west.name': 'EDGE-WEST-SENTINEL',
    'hud.build.queue-order': 'order/{buildable}/{x}/{y}/{edge}/{total}',
    'hud.build.queue-unnamed': 'UNNAMED-SENTINEL',
    'hud.build.buildable.wall-brick': 'WALL-SENTINEL',
  });
  const localizer = new Localizer({ locale: 'en', catalogs: [sentinels] });
  const t = (key: Parameters<Localizer['format']>[0], parameters?: Parameters<Localizer['format']>[1]): string =>
    parameters === undefined ? localizer.format(key) : localizer.format(key, parameters);

  const order = (overrides: Partial<HudBuildOrderViewModel> = {}): HudBuildOrderViewModel => ({
    orderId: 'order-1',
    labelKey: 'hud.build.buildable.wall-brick',
    tile: { x: 5, y: 7 },
    edge: 'north',
    state: 'assigned',
    cancelRefundMinorUnits: 80,
    ...overrides,
  });

  it('says what it is, where it is and which edge -- which is how a player tells two walls apart', () => {
    expect(formatBuildQueueOrderText(t, order(), 'TOTAL-SENTINEL')).toBe('order/WALL-SENTINEL/5/7/EDGE-NORTH-SENTINEL/TOTAL-SENTINEL');
  });

  it('distinguishes two orders on the same tile by their edge', () => {
    // The case that makes the edge load-bearing rather than decorative: a
    // corner is two walls on one tile, and a row that dropped the edge would
    // offer two identical controls for two different orders.
    const north = formatBuildQueueOrderText(t, order({ edge: 'north' }), 'TOTAL-SENTINEL');
    const west = formatBuildQueueOrderText(t, order({ edge: 'west' }), 'TOTAL-SENTINEL');
    expect(north).not.toBe(west);
    expect(west).toBe('order/WALL-SENTINEL/5/7/EDGE-WEST-SENTINEL/TOTAL-SENTINEL');
  });

  it('still draws a row for an order the host names no buildable for', () => {
    /*
     * Reachable by construction: the buildable registry carries an English
     * `name` and no key (`docs/HUD_PROJECTIONS.md` gap 32), so the host's
     * mapping can answer nothing. The row must survive it -- an order nobody
     * can name is still an order a player may want to cancel, and dropping it
     * would hide the only control that reaches it.
     */
    const { labelKey: _dropped, ...unnamed } = order();
    expect(formatBuildQueueOrderText(t, unnamed, 'TOTAL-SENTINEL')).toBe('order/UNNAMED-SENTINEL/5/7/EDGE-NORTH-SENTINEL/TOTAL-SENTINEL');
  });

  it('says what cancelling it would give back, in the pending-deliveries row\'s own pattern (the owner\'s ruling of 2026-09-02)', () => {
    // `total` is a formatted string handed in, exactly as `formatPendingDeliveryText`'s
    // own `total` parameter is -- this function does no number formatting of
    // its own, so the caller's `HudLocalizer.formatNumber` output passes
    // through unchanged.
    expect(formatBuildQueueOrderText(t, order(), '80')).toBe('order/WALL-SENTINEL/5/7/EDGE-NORTH-SENTINEL/80');
  });

  it('says "0 back" rather than hiding the row or the figure when nothing would come back', () => {
    // The owner's ruling names this explicitly: zero is a real, displayed
    // answer -- an `'in-progress'` order, among others -- never an absence.
    const shipped = new Localizer({ locale: 'en', catalogs: [defaultMessageCatalogEn] });
    const format = (key: Parameters<Localizer['format']>[0], parameters?: Parameters<Localizer['format']>[1]): string =>
      parameters === undefined ? shipped.format(key) : shipped.format(key, parameters);
    const row = formatBuildQueueOrderText(
      format,
      order({ state: 'in-progress', cancelRefundMinorUnits: 0 }),
      shipped.formatNumber(0),
    );
    expect(row).toContain('0 back');
  });

  it('produces a different row per order with the strings that actually ship', () => {
    // The sentinels above are invented, so they would not notice a shipped
    // `hud.build.queue-order` that stopped interpolating a field -- every row
    // would read the same and the player could not tell which control is which.
    const shipped = new Localizer({ locale: 'en', catalogs: [defaultMessageCatalogEn] });
    const format = (key: Parameters<Localizer['format']>[0], parameters?: Parameters<Localizer['format']>[1]): string =>
      parameters === undefined ? shipped.format(key) : shipped.format(key, parameters);
    const first = formatBuildQueueOrderText(format, order({ tile: { x: 5, y: 7 } }), '80');
    const second = formatBuildQueueOrderText(format, order({ tile: { x: 5, y: 8 } }), '80');
    const third = formatBuildQueueOrderText(format, order({ tile: { x: 5, y: 7 }, edge: 'west' }), '80');
    expect(new Set([first, second, third]).size).toBe(3);
    expect(first).toContain(shipped.format('build-edge.north.name'));
  });

  it('carries the refund figure through into the shipped row, distinguishing two otherwise-identical orders', () => {
    // The fourth field the shipped template interpolates, alongside tile and
    // edge: two rows that agree on buildable, tile and edge must still read
    // differently when what cancelling them gives back differs, or a player
    // reading two queued walls at the same coordinates could not tell the
    // fresh one (money back) from the started one (nothing back) apart.
    const shipped = new Localizer({ locale: 'en', catalogs: [defaultMessageCatalogEn] });
    const format = (key: Parameters<Localizer['format']>[0], parameters?: Parameters<Localizer['format']>[1]): string =>
      parameters === undefined ? shipped.format(key) : shipped.format(key, parameters);
    const funded = formatBuildQueueOrderText(format, order(), shipped.formatNumber(80));
    const started = formatBuildQueueOrderText(format, order(), shipped.formatNumber(0));
    expect(funded).not.toBe(started);
    expect(funded).toContain(shipped.formatNumber(80));
    expect(started).toContain(shipped.formatNumber(0));
  });

  it('bounds how many rows the block ever holds', () => {
    // Not a preference: `BUILD_QUEUE_ROW_LIMIT` carries the panel's height
    // measurement and the argument for showing the head of the queue. A list
    // that grew with the queue is what the 7.8px arrival budget forbids, and
    // pooling the rows is what keeps the HUD's busy group -- which has `add` and
    // no `remove` -- from growing over a session.
    expect(BUILD_QUEUE_ROW_LIMIT).toBeGreaterThan(1);
    expect(BUILD_QUEUE_ROW_LIMIT).toBeLessThanOrEqual(4);
  });
});

describe('a delivery row says what it gives back', () => {
  /**
   * Sentinels for the same reason the queued row uses them: the expected strings
   * can then be written out in full, and a template that dropped a field is
   * visible rather than merely different.
   */
  const sentinels = buildMessageCatalog('en', {
    'hud.build.delivery': 'delivery/{count}/{material}/{total}',
    'hud.build.delivery-unnamed': 'UNNAMED-MATERIAL-SENTINEL',
    'item.brick.name': 'BRICK-SENTINEL',
  });
  const localizer = new Localizer({ locale: 'en', catalogs: [sentinels] });
  const t = (key: Parameters<Localizer['format']>[0], parameters?: Parameters<Localizer['format']>[1]): string =>
    parameters === undefined ? localizer.format(key) : localizer.format(key, parameters);

  const delivery = (overrides: Partial<HudPendingDeliveryViewModel> = {}): HudPendingDeliveryViewModel => ({
    orderId: 'buy-1',
    labelKey: 'item.brick.name',
    quantity: 3,
    paidMinorUnits: 120,
    ...overrides,
  });

  it('says how much of what, and what cancelling it returns', () => {
    expect(formatPendingDeliveryText(t, delivery(), '120')).toBe('delivery/3/BRICK-SENTINEL/120');
  });

  it('renders the figure it was handed rather than deriving one from the quantity', () => {
    /*
     * The load-bearing property of this sentence. `ProcurementSystem.cancel`
     * refunds the *recorded* `paidMinorUnits`, so the row must promise that and
     * nothing else -- a row that multiplied a quantity by today's unit price
     * would promise the wrong amount the moment prices ever move, which is the
     * bug the recorded refund exists to prevent.
     *
     * Driven with a total that is deliberately not `quantity` times anything the
     * catalogue knows: an implementation that recomputed would print 120.
     */
    expect(formatPendingDeliveryText(t, delivery({ paidMinorUnits: 7 }), '7')).toBe('delivery/3/BRICK-SENTINEL/7');
  });

  it('still draws a row for a delivery the host names no item for', () => {
    // Money nobody can label is still money: dropping the row would hide the
    // only control that recovers the payment.
    const { labelKey: _dropped, ...unnamed } = delivery();
    expect(formatPendingDeliveryText(t, unnamed, '120')).toBe('delivery/3/UNNAMED-MATERIAL-SENTINEL/120');
  });

  it('produces a different row per delivery with the strings that actually ship', () => {
    // The sentinels above are invented, so they would not notice a shipped
    // `hud.build.delivery` that stopped interpolating a field -- every row would
    // read the same, and the figures a player is deciding on would be missing.
    const shipped = new Localizer({ locale: 'en', catalogs: [defaultMessageCatalogEn] });
    const format = (key: Parameters<Localizer['format']>[0], parameters?: Parameters<Localizer['format']>[1]): string =>
      parameters === undefined ? shipped.format(key) : shipped.format(key, parameters);
    const three = formatPendingDeliveryText(format, delivery({ quantity: 3, paidMinorUnits: 120 }), '120');
    const two = formatPendingDeliveryText(format, delivery({ quantity: 2, paidMinorUnits: 80 }), '80');
    expect(three).not.toBe(two);
    expect(three).toContain(shipped.format('item.brick.name'));
    expect(three).toContain('120');
    expect(two).toContain('80');
  });

  it('bounds how many rows the block ever holds, and the bound is a rectangle', () => {
    /*
     * Not a preference: `PENDING_DELIVERY_ROW_LIMIT` carries the measurement.
     * At 900x600 on the assembled page the open buy disclosure with three rows
     * and the "and N more" line is 312.9px against a 337.0px visible panel box;
     * at four rows it is 360.9px and the fourth Cancel's box ends 7.9px below
     * the panel's visible bottom with a full 78x44 rectangle and an
     * `offsetParent` -- laid out, hit-testable, and off screen (#220's shape).
     */
    expect(PENDING_DELIVERY_ROW_LIMIT).toBeGreaterThan(1);
    expect(PENDING_DELIVERY_ROW_LIMIT).toBeLessThanOrEqual(3);
  });
});

/**
 * The catalogue's category filter (#390, ADR 0035).
 *
 * Both functions are exported and pure for the reason `buildEdgeChoiceOptions`
 * is: the default Vitest environment is `node` (`docs/TESTING.md`), so nothing
 * headless can call `createBuildPanel`, and "which rows the filter leaves on
 * screen" is exactly the claim that must be assertable without a DOM. The
 * *heights* the filter buys are a browser question and are measured in
 * `tests/browser/app-shell.spec.ts`; this is the vocabulary half.
 *
 * The fixtures are written out rather than derived from `BUILDABLE_REGISTRY`.
 * A fixture that read the real registry would compute its expected value from
 * the code under test (#375), and would also change every time a content row
 * lands -- which is the event this filter exists to survive.
 */
describe('the buildable catalogue groups by category', () => {
  const buildable = (
    definitionId: string,
    categoryId: string,
    categoryLabelKey: string,
  ): HudBuildableViewModel => ({
    definitionId,
    labelKey: `content.${definitionId}`,
    occupiesEdge: false,
    placesObject: true,
    categoryId,
    categoryLabelKey,
  });

  /**
   * Deliberately in an order where the categories interleave, so an
   * implementation that assumed the rows arrive grouped fails here.
   */
  const rows: readonly HudBuildableViewModel[] = [
    buildable('wall-brick', 'structure', 'category.structure'),
    buildable('bed-wooden', 'furniture', 'category.furniture'),
    buildable('door-wooden', 'structure', 'category.structure'),
    buildable('toilet-brick', 'sanitation', 'category.sanitation'),
    buildable('chair-wooden', 'furniture', 'category.furniture'),
  ];

  const t = (key: string): string => `[${key}]`;

  it('offers All first, then each category once, in the order the rows arrive', () => {
    expect(buildCategoryOptions(rows, t)).toEqual([
      { id: BUILD_CATEGORY_ALL, label: '[hud.build.category-all]' },
      { id: 'structure', label: '[category.structure]' },
      { id: 'furniture', label: '[category.furniture]' },
      { id: 'sanitation', label: '[category.sanitation]' },
    ]);
  });

  it('offers no filter at all for an empty catalogue', () => {
    expect(buildCategoryOptions([], t)).toEqual([]);
  });

  it('offers no filter when every row is in one group', () => {
    // A control every option of which shows the same list. The real catalogue
    // has eight groups, so this is `tests/browser/ui-harness.ts`'s state rather
    // than the application's.
    expect(buildCategoryOptions(rows.filter((row) => row.categoryId === 'structure'), t)).toEqual([]);
  });

  it('shows every row under All', () => {
    expect(visibleBuildableIds(rows, BUILD_CATEGORY_ALL, 'wall-brick')).toEqual([
      'wall-brick',
      'bed-wooden',
      'door-wooden',
      'toilet-brick',
      'chair-wooden',
    ]);
  });

  it('shows one category, and keeps the selected row whatever category it is in', () => {
    // `wall-brick` is selected and is structural, so filtering to furniture
    // leaves it on screen: the filter is a view operation and must not hide
    // the row whose badge says what the next press will place.
    expect(visibleBuildableIds(rows, 'furniture', 'wall-brick')).toEqual([
      'wall-brick',
      'bed-wooden',
      'chair-wooden',
    ]);
  });

  it('adds no row twice when the selection is already in the active category', () => {
    expect(visibleBuildableIds(rows, 'furniture', 'chair-wooden')).toEqual(['bed-wooden', 'chair-wooden']);
  });

  it('shows the active category alone when nothing is selected', () => {
    expect(visibleBuildableIds(rows, 'structure', undefined)).toEqual(['wall-brick', 'door-wooden']);
  });

  it('shows nothing for a category no row carries', () => {
    expect(visibleBuildableIds(rows, 'medical', undefined)).toEqual([]);
  });
});

/**
 * The keyboard's ring around that same catalogue (#411, the Build half).
 *
 * ### Why these are the assertions
 *
 * The Rooms catalogue got a roving tab stop and this one did not, and the
 * reason it could not simply be copied is the category filter above: a row can
 * be `hidden`, `hidden` takes an element out of sequential focus navigation,
 * and `focus()` on one does nothing. So both halves of the roving tab stop have
 * to be read off the *visible* rows:
 *
 * - a `tabIndex = 0` parked on a filtered-out row is a catalogue `Tab` cannot
 *   enter **at all** -- twenty-one rows unreachable, strictly worse than the
 *   twenty-one tab stops the change removes;
 * - a ring that included hidden rows would give the player an arrow press that
 *   silently moves nothing.
 *
 * ### Why they are here rather than in the browser suite
 *
 * `vitest.config.ts` runs in `environment: 'node'` with no jsdom
 * (`docs/TESTING.md`), so nothing headless can call `createBuildPanel` or read
 * a resolved `tabIndex`. What *is* reachable from node is the arithmetic, and
 * that is what this file pins. The wiring -- that the panel really puts the `0`
 * on the row this function names, and that a real arrow press moves a real
 * `document.activeElement` -- is asserted in
 * `tests/browser/ui-shell.spec.ts`, which is the same split
 * `tests/unit/ui-roving-focus.test.ts` and that file already make for the Rooms
 * catalogue.
 *
 * The fixtures are written out rather than derived from `BUILDABLE_REGISTRY`,
 * for the reason the block above says.
 */
describe("the Build catalogue's keyboard focus ring", () => {
  const buildable = (
    definitionId: string,
    categoryId: string,
    categoryLabelKey: string,
  ): HudBuildableViewModel => ({
    definitionId,
    labelKey: `content.${definitionId}`,
    occupiesEdge: false,
    placesObject: true,
    categoryId,
    categoryLabelKey,
  });

  /** Interleaved categories, so an implementation that assumed the rows arrive grouped fails here. */
  const rows: readonly HudBuildableViewModel[] = [
    buildable('wall-brick', 'structure', 'category.structure'),
    buildable('bed-wooden', 'furniture', 'category.furniture'),
    buildable('door-wooden', 'structure', 'category.structure'),
    buildable('toilet-brick', 'sanitation', 'category.sanitation'),
    buildable('chair-wooden', 'furniture', 'category.furniture'),
  ];

  it('rings every row, and stops on the selection, when nothing is filtered', () => {
    expect(buildCatalogueFocusRing(rows, BUILD_CATEGORY_ALL, 'door-wooden')).toEqual({
      visibleIds: ['wall-brick', 'bed-wooden', 'door-wooden', 'toilet-brick', 'chair-wooden'],
      tabStopId: 'door-wooden',
    });
  });

  it('rings only the rows the filter left on screen', () => {
    // `wall-brick` is structural and selected, so it is on screen inside the
    // furniture group -- and the two rows the filter hid are not in the ring,
    // which is what stops an arrow press from naming one of them.
    expect(buildCatalogueFocusRing(rows, 'furniture', 'wall-brick')).toEqual({
      visibleIds: ['wall-brick', 'bed-wooden', 'chair-wooden'],
      tabStopId: 'wall-brick',
    });
  });

  it('falls back to the first *visible* row when nothing is selected', () => {
    // The case that separates a ring over the visible rows from a ring over
    // every row: `wall-brick` is first in the catalogue and hidden here, so an
    // implementation that counted from the full list would hand the group's one
    // tab stop to a row `Tab` cannot reach -- and the catalogue would have no
    // keyboard entry point at all.
    expect(buildCatalogueFocusRing(rows, 'furniture', undefined)).toEqual({
      visibleIds: ['bed-wooden', 'chair-wooden'],
      tabStopId: 'bed-wooden',
    });
  });

  it('has no tab stop when the filter left nothing on screen', () => {
    // Not a state the application reaches -- `buildCategoryOptions` only ever
    // offers a group some row is in -- but `undefined` is the honest answer and
    // `0` would name a row that does not exist.
    expect(buildCatalogueFocusRing(rows, 'medical', undefined)).toEqual({
      visibleIds: [],
      tabStopId: undefined,
    });
  });

  it('has no tab stop for an empty catalogue', () => {
    expect(buildCatalogueFocusRing([], BUILD_CATEGORY_ALL, undefined)).toEqual({
      visibleIds: [],
      tabStopId: undefined,
    });
  });

  /**
   * The property the whole change turns on, over every state the filter can be
   * in and every row that can be selected -- rather than over the four cases
   * above, which is what an off-by-one hides behind.
   */
  it('never parks the tab stop on a row that is not on screen', () => {
    const categories = [BUILD_CATEGORY_ALL, 'structure', 'furniture', 'sanitation', 'medical'];
    const selections = [undefined, ...rows.map((row) => row.definitionId)];
    for (const categoryId of categories) {
      for (const selectedId of selections) {
        const ring = buildCatalogueFocusRing(rows, categoryId, selectedId);
        const where = `category ${categoryId}, selection ${selectedId ?? 'none'}`;
        if (ring.visibleIds.length === 0) {
          expect(ring.tabStopId, `${where}: an empty catalogue was given a tab stop`).toBeUndefined();
          continue;
        }
        expect(
          ring.tabStopId,
          `${where}: the catalogue has rows on screen and no way to Tab into them`,
        ).toBeDefined();
        expect(
          ring.visibleIds,
          `${where}: the one tab stop is on a row the filter hid, so Tab cannot enter the catalogue`,
        ).toContain(ring.tabStopId);
      }
    }
  });

  /**
   * And that the ring really is a ring of the *visible* rows, read through the
   * same function the panel's `keydown` handler uses.
   *
   * `bed-wooden` is the case that discriminates: forwards from it the next row
   * in the full catalogue is `door-wooden`, which this filter has hidden, and
   * the next row in the ring is `chair-wooden`. An arrow that named the hidden
   * one would move nothing at all.
   */
  it('arrows past the rows the filter hid rather than into them', () => {
    const { visibleIds } = buildCatalogueFocusRing(rows, 'furniture', 'wall-brick');
    const step = (from: string, key: string): string | undefined => {
      const next = rovingFocusMove(key, visibleIds.indexOf(from), visibleIds.length);
      return next === undefined ? undefined : visibleIds[next];
    };
    expect(step('bed-wooden', 'ArrowDown'), 'ArrowDown stepped onto a filtered-out row').toBe('chair-wooden');
    expect(step('bed-wooden', 'ArrowUp')).toBe('wall-brick');
    expect(step('chair-wooden', 'ArrowDown'), 'the ring did not wrap').toBe('wall-brick');
    expect(step('wall-brick', 'ArrowUp'), 'the ring did not wrap backwards').toBe('chair-wooden');
    expect(step('bed-wooden', 'End')).toBe('chair-wooden');
    expect(step('bed-wooden', 'Home')).toBe('wall-brick');
    expect(step('bed-wooden', 'Tab'), 'the group swallowed a key that is not its own').toBeUndefined();
  });
});
