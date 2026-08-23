import { z } from 'zod';
import { identifierSchema } from '../simulation/protocol/types';

export const SCENARIO_CATALOG_SCHEMA_VERSION = 1 as const;

/**
 * One quantity of one item placed in one container at session start.
 *
 * `containerId` is a *runtime* container id rather than a catalog id, and
 * deliberately so: containers are created by a session, not declared as
 * content (`docs/OPERATIONS.md`). The one id that is stable enough to name
 * from content is `CONSTRUCTION_MATERIALS_CONTAINER_ID`, which
 * `createNewSimulationRuntime` registers on every session. Naming any other
 * id is legal and creates that container -- see `applyScenario`.
 */
export const scenarioStartingStockSchema = z
  .object({
    containerId: identifierSchema,
    itemId: identifierSchema,
    /** Positive: `Container.deposit` rejects zero and negatives, and "declare nothing" is spelled by omitting the entry. */
    quantity: z.number().int().min(1).max(1_000_000),
  })
  .strict();

export type ScenarioStartingStock = z.infer<typeof scenarioStartingStockSchema>;

/**
 * What a session starts with, as data (ADR 0018).
 *
 * This is the whole scenario model today: the resources a prison opens
 * with. It exists because `createNewSimulationRuntime` deliberately
 * fabricates no content, which left a real session with an empty
 * construction container and therefore with a build order that could never
 * leave `'materials-pending'`.
 *
 * It is deliberately *small*, not a scenario framework. Issue #33 owns
 * that, and will need goals, difficulty, starting population and starting
 * geometry -- none of which belong here in advance of the systems that
 * would read them.
 *
 * There is no `numericId` and no `ContentRegistry`, unlike the room/object/
 * item catalogs. `numericId` exists so a definition can be encoded
 * compactly into a world layer or a snapshot; nothing encodes a scenario
 * anywhere. A save records a scenario's *effects* -- the container stock it
 * deposited, carried by `ContainerRegistry.getSnapshot` -- and never its
 * identity, which is why a restore must not re-apply one.
 */
export const scenarioDefinitionSchema = z
  .object({
    schemaVersion: z.literal(SCENARIO_CATALOG_SCHEMA_VERSION),
    id: identifierSchema,
    nameKey: identifierSchema,
    startingStock: z.array(scenarioStartingStockSchema).max(256),
  })
  .strict();

export type ScenarioDefinition = z.infer<typeof scenarioDefinitionSchema>;

/**
 * The well-known container `createNewSimulationRuntime` registers for
 * `ConstructionSystem` to draw from.
 *
 * Duplicated as a literal rather than imported from
 * `src/simulation/runtime/new-session.ts`: `src/content/` is imported *by*
 * the simulation and must not import the session runtime back, and the
 * value is a stable persisted id in any case. `tests/unit/scenario-catalog.test.ts`
 * asserts the two agree, so the duplication cannot drift silently.
 */
const CONSTRUCTION_MATERIALS_CONTAINER_ID = 'construction-materials';

/**
 * The scenario a new prison starts from.
 *
 * The quantities are **proposed directional values, not a balance
 * decision** (ADR 0018 §2). Derivation: the starter world is one owned
 * 32x32 chunk; a perimeter plus a first ten-cell block is roughly 240 wall
 * segments at 2 bricks each, so 600 bricks leaves a margin without making
 * the supply effectively infinite. 120 planks is far more doors than such a
 * prison needs, because a plank shortage blocking a door while bricks
 * remain would read as an arbitrary wall rather than a designed constraint.
 *
 * They are finite and nothing replenishes them. That is a known, recorded
 * limitation, not an oversight -- a renewable supply needs something able
 * to refuse it, and that is issue #29's economy.
 */
export const STARTER_SCENARIO: ScenarioDefinition = {
  schemaVersion: SCENARIO_CATALOG_SCHEMA_VERSION,
  id: 'scenario.starter',
  nameKey: 'scenario.starter.name',
  startingStock: [
    { containerId: CONSTRUCTION_MATERIALS_CONTAINER_ID, itemId: 'item.brick', quantity: 600 },
    { containerId: CONSTRUCTION_MATERIALS_CONTAINER_ID, itemId: 'item.wood-plank', quantity: 120 },
  ],
};

const rawScenarioDefinitions: readonly ScenarioDefinition[] = [STARTER_SCENARIO];

export type ScenarioCatalogError =
  | { readonly kind: 'schema'; readonly index: number; readonly issues: readonly string[] }
  | { readonly kind: 'duplicate-id'; readonly id: string };

export interface ScenarioCatalog {
  readonly definitions: readonly ScenarioDefinition[];
  readonly errors: readonly ScenarioCatalogError[];
}

/**
 * Validates a scenario list and returns it in ascending-id order, never
 * declaration order -- the same determinism rule `ContentRegistry.all()`
 * follows for every other catalog.
 */
export function loadScenarioCatalog(entries: readonly unknown[] = rawScenarioDefinitions): ScenarioCatalog {
  const parsed: ScenarioDefinition[] = [];
  const errors: ScenarioCatalogError[] = [];
  const seen = new Set<string>();

  entries.forEach((raw, index) => {
    const result = scenarioDefinitionSchema.safeParse(raw);
    if (!result.success) {
      errors.push({ kind: 'schema', index, issues: result.error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`) });
      return;
    }
    if (seen.has(result.data.id)) {
      errors.push({ kind: 'duplicate-id', id: result.data.id });
      return;
    }
    seen.add(result.data.id);
    parsed.push(result.data);
  });

  return {
    definitions: parsed.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)),
    errors,
  };
}

export const defaultScenarioCatalog = loadScenarioCatalog();

if (defaultScenarioCatalog.errors.length > 0) {
  throw new Error(`Default scenario catalog failed validation: ${JSON.stringify(defaultScenarioCatalog.errors)}`);
}

export function getScenarioDefinition(id: string): ScenarioDefinition | undefined {
  return defaultScenarioCatalog.definitions.find((definition) => definition.id === id);
}
