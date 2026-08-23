import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SIMULATION_ENUM_GROUPS, deriveSimulationMessageKey, type SimulationEnumGroup } from '../../src/content';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { BUILD_EDGES, DEFAULT_BUILD_EDGE } from '../../src/simulation/construction';
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

  it('derives the labels in the panel instead of mapping them by hand', () => {
    const source = readFileSync(join(__dirname, '../../src/ui/hud/build-panel.ts'), 'utf8');
    expect(source).toContain("deriveSimulationMessageKey('build-edge'");
    // The HUD boundary still holds: content, never simulation.
    expect(source).not.toMatch(/from ['"][^'"]*\/simulation\//);
  });
});
