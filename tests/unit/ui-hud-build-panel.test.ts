import { describe, expect, it } from 'vitest';
import { SIMULATION_ENUM_GROUPS, deriveSimulationMessageKey, type SimulationEnumGroup } from '../../src/content';
import { Localizer, buildMessageCatalog, defaultMessageCatalogEn } from '../../src/services/localization';
import { BUILD_EDGES, DEFAULT_BUILD_EDGE } from '../../src/simulation/construction';
import { buildEdgeChoiceOptions, formatBuildTargetText } from '../../src/ui/hud/build-panel';
import { HUD_MESSAGE_KEYS } from '../../src/ui/hud/messages';
import { HUD_BUILD_EDGES } from '../../src/ui/hud/view-model';

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
