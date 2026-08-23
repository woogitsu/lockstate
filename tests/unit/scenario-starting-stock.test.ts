import { describe, expect, it } from 'vitest';
import {
  STARTER_SCENARIO,
  defaultLocaleEnCatalog,
  defaultItemRegistry,
  defaultScenarioCatalog,
  loadScenarioCatalog,
  resolveLocalizationKey,
  scenarioDefinitionSchema,
  validateScenarioItemReferences,
  type ScenarioDefinition,
} from '../../src/content';
import { BUILDABLE_REGISTRY, validateBuildableItemReferences } from '../../src/simulation/construction/definition';
import { applyScenario } from '../../src/simulation/runtime/apply-scenario';
import { CONSTRUCTION_MATERIALS_CONTAINER_ID, createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';

/**
 * ADR 0018's data half: what a scenario is allowed to declare, and what
 * happens when it declares something that does not exist.
 *
 * The failure this guards against is specific and quiet. A scenario that
 * stocks an item id nothing declares -- or a buildable that requires one --
 * produces no error at all: the container fills with an item nobody can
 * spend, and the only symptom is a build order that waits in
 * `'materials-pending'` forever, which is exactly what the bug this change
 * fixes looked like. So both directions are checked, and both are checked
 * at import time.
 */
describe('scenario catalog', () => {
  it('the shipped starter scenario stocks only real item-catalog items', () => {
    expect(validateScenarioItemReferences(defaultScenarioCatalog.definitions, defaultItemRegistry)).toEqual([]);
    expect(defaultScenarioCatalog.errors).toEqual([]);
    expect(defaultScenarioCatalog.definitions).toContainEqual(STARTER_SCENARIO);
  });

  it('reports the offending scenario and item when a scenario stocks an item that does not exist', () => {
    const invented: ScenarioDefinition = {
      schemaVersion: 1,
      id: 'scenario.invented',
      nameKey: 'scenario.invented.name',
      startingStock: [{ containerId: 'construction-materials', itemId: 'item.unobtanium', quantity: 1 }],
    };

    expect(validateScenarioItemReferences([invented], defaultItemRegistry)).toEqual([
      { kind: 'missing-item-reference', scenarioId: 'scenario.invented', itemId: 'item.unobtanium' },
    ]);
  });

  it('every buildable requires only real item-catalog items, in both vocabularies', () => {
    expect(validateBuildableItemReferences()).toEqual([]);

    // Stated positively as well, so deleting the validator's loop body would
    // not leave this file passing on an empty array either way.
    const required = [...BUILDABLE_REGISTRY.values()].flatMap((definition) => definition.materialsRequired.map((m) => m.itemId));
    expect(required.length).toBeGreaterThan(0);
    for (const itemId of required) expect(defaultItemRegistry.has(itemId)).toBe(true);
  });

  it('the starter scenario stocks every material the shipped buildables require', () => {
    const stocked = new Set(STARTER_SCENARIO.startingStock.map((entry) => entry.itemId));
    for (const definition of BUILDABLE_REGISTRY.values()) {
      for (const requirement of definition.materialsRequired) {
        expect(stocked, `nothing stocks ${requirement.itemId}, required by ${definition.id}`).toContain(requirement.itemId);
      }
    }
  });

  it('stocks the container `createNewSimulationRuntime` actually wires into ConstructionSystem', () => {
    // The catalog cannot import the runtime constant, so it repeats the
    // literal. This is the assertion that stops the two from drifting into
    // a scenario that fills a container nothing reads.
    for (const entry of STARTER_SCENARIO.startingStock) {
      expect(entry.containerId).toBe(CONSTRUCTION_MATERIALS_CONTAINER_ID);
    }
  });

  it('resolves the scenario nameKey against the bundled default locale', () => {
    expect(resolveLocalizationKey(defaultLocaleEnCatalog, STARTER_SCENARIO.nameKey)).not.toBe(STARTER_SCENARIO.nameKey);
  });

  it('rejects a malformed scenario rather than loading a partial one', () => {
    expect(scenarioDefinitionSchema.safeParse({ ...STARTER_SCENARIO, schemaVersion: 2 }).success).toBe(false);
    expect(
      scenarioDefinitionSchema.safeParse({ ...STARTER_SCENARIO, startingStock: [{ containerId: 'c', itemId: 'item.brick', quantity: 0 }] }).success,
    ).toBe(false);
    expect(
      scenarioDefinitionSchema.safeParse({ ...STARTER_SCENARIO, startingStock: [{ containerId: 'c', itemId: 'item.brick', quantity: 1.5 }] }).success,
    ).toBe(false);
    expect(scenarioDefinitionSchema.safeParse({ ...STARTER_SCENARIO, unexpected: true }).success).toBe(false);
  });

  it('loads in ascending id order and reports a duplicate id instead of silently keeping one', () => {
    const b: ScenarioDefinition = { schemaVersion: 1, id: 'scenario.b', nameKey: 'x.name', startingStock: [] };
    const a: ScenarioDefinition = { schemaVersion: 1, id: 'scenario.a', nameKey: 'x.name', startingStock: [] };

    const sorted = loadScenarioCatalog([b, a]);
    expect(sorted.definitions.map((definition) => definition.id)).toEqual(['scenario.a', 'scenario.b']);
    expect(sorted.errors).toEqual([]);

    const duplicated = loadScenarioCatalog([a, a]);
    expect(duplicated.errors).toEqual([{ kind: 'duplicate-id', id: 'scenario.a' }]);
    expect(duplicated.definitions).toHaveLength(1);
  });
});

describe('applyScenario', () => {
  it('a runtime on its own still fabricates nothing -- the scenario is what puts stock in it', () => {
    const runtime = createNewSimulationRuntime(1);
    const materials = runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID);

    expect(materials.quantityOf('item.brick')).toBe(0);
    expect(materials.quantityOf('item.wood-plank')).toBe(0);
    expect(runtime.containers.all().map((container) => container.id)).toEqual([CONSTRUCTION_MATERIALS_CONTAINER_ID]);

    applyScenario(runtime, STARTER_SCENARIO);

    expect(materials.quantityOf('item.brick')).toBe(600);
    expect(materials.quantityOf('item.wood-plank')).toBe(120);
  });

  it('registers a container the scenario names but the runtime does not pre-register', () => {
    const runtime = createNewSimulationRuntime(1);

    applyScenario(runtime, {
      schemaVersion: 1,
      id: 'scenario.delivery',
      nameKey: 'x.name',
      startingStock: [{ containerId: 'delivery-bay-0', itemId: 'item.food-ration', quantity: 7 }],
    });

    expect(runtime.containers.require('delivery-bay-0').quantityOf('item.food-ration')).toBe(7);
    // ...and the pre-registered one is untouched, not replaced.
    expect(runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID).quantityOf('item.food-ration')).toBe(0);
  });

  it('adds to an existing container rather than replacing its contents', () => {
    const runtime = createNewSimulationRuntime(1);
    runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID).deposit('item.brick', 5);

    applyScenario(runtime, {
      schemaVersion: 1,
      id: 'scenario.extra',
      nameKey: 'x.name',
      startingStock: [{ containerId: CONSTRUCTION_MATERIALS_CONTAINER_ID, itemId: 'item.brick', quantity: 3 }],
    });

    expect(runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID).quantityOf('item.brick')).toBe(8);
  });

  it('draws from no RNG stream, so seeding cannot perturb any subsystem\'s sequence', () => {
    const seeded = createNewSimulationRuntime(7);
    const bare = createNewSimulationRuntime(7);
    applyScenario(seeded, STARTER_SCENARIO);

    for (const stream of ['prisoners.classification', 'contraband.detection', 'contraband.intelligence', 'identity.actor-name']) {
      expect(seeded.kernel.rng.get(stream).nextUint32(), stream).toBe(bare.kernel.rng.get(stream).nextUint32());
    }
  });
});
