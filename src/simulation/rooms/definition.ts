import { defaultRoomContentRegistry, type RoomCatalogDefinition } from '../../content';

export interface RoomRequirement {
  readonly type: 'minimum-size' | 'enclosed' | 'object' | 'outdoors';

  // For 'minimum-size'
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly minTiles?: number;

  // For 'object'
  readonly objectId?: string;
  readonly minQuantity?: number;
}

export interface RoomDefinition {
  readonly id: string;
  /**
   * **The key, not the text.** This field was `name: string` and held the
   * resolved English label, assigned from `resolveLocalizationKey` against
   * `defaultLocaleEnCatalog` -- a translated string living in a
   * `src/simulation/` type, which ADR 0011 and `docs/ARCHITECTURE.md`
   * ("Simulation code may branch on a stable id; it may never read translated
   * text") both forbid outright.
   *
   * The reason it survived is worth keeping written down: the boundary test
   * meant to prevent it matched only the *import specifier*
   * (`/from ['"][^'"]*localization['"]/`), and this module imported the
   * resolver from `'../../content'`, the barrel that re-exports it. So the
   * violation was in the tree, in the one file under `src/simulation/` that
   * called the resolver, and invisible to the gate whose whole purpose was to
   * refuse it. `tests/unit/services-layer-boundaries.test.ts` now checks the
   * symbols by name as well, which no re-export can route around.
   *
   * Typed `string` and named `<x>Key`, following
   * `RestoredScopeEntry.labelKey` in `src/simulation/runtime/restore-session.ts`
   * -- the same situation, already decided there: the alias
   * `LocalizationKey` is itself `string`, so importing it would buy a
   * documentation nicety at the cost of the import the gate refuses. A
   * consumer resolves this against a locale catalog at the UI boundary, at
   * the last possible moment (`docs/HUD_PROJECTIONS.md` contract 3).
   */
  readonly nameKey: string;
  readonly numericId: number; // for zoning Uint8Array storage
  readonly requirements: readonly RoomRequirement[];
}

export class RoomRegistry {
  private definitions = new Map<string, RoomDefinition>();
  private definitionsByNumericId = new Map<number, RoomDefinition>();

  public register(def: RoomDefinition): void {
    if (this.definitions.has(def.id)) {
      throw new Error(`Room definition ${def.id} is already registered.`);
    }
    if (this.definitionsByNumericId.has(def.numericId)) {
      throw new Error(`Room numeric ID ${def.numericId} is already in use.`);
    }
    this.definitions.set(def.id, def);
    this.definitionsByNumericId.set(def.numericId, def);
  }

  public getById(id: string): RoomDefinition | undefined {
    return this.definitions.get(id);
  }

  public getByNumericId(numericId: number): RoomDefinition | undefined {
    return this.definitionsByNumericId.get(numericId);
  }
}

/**
 * Converts issue #23's validated, versioned, localization-key-carrying
 * `RoomCatalogDefinition` into #17's simpler runtime-facing `RoomDefinition`
 * -- same requirement shape, and the `nameKey` carried straight across.
 *
 * **It used to take a `locale` catalog and resolve the key here**, defaulting
 * to `defaultLocaleEnCatalog`. That parameter is gone rather than made
 * optional: a locale catalog has no business crossing into `src/simulation/`
 * at all, so there is nothing left for a caller to pass. Resolution belongs
 * to whichever surface renders the name, which is also the only place that
 * knows which locale the player is in -- this function never did.
 */
export function roomDefinitionFromCatalog(entry: RoomCatalogDefinition): RoomDefinition {
  return {
    id: entry.id,
    nameKey: entry.nameKey,
    numericId: entry.numericId,
    requirements: entry.requirements,
  };
}

export function buildRoomRegistryFromCatalog(
  entries: readonly RoomCatalogDefinition[] = defaultRoomContentRegistry.all(),
): RoomRegistry {
  const registry = new RoomRegistry();
  for (const entry of entries) {
    registry.register(roomDefinitionFromCatalog(entry));
  }
  return registry;
}

