import { defaultLocaleEnCatalog, defaultRoomContentRegistry, resolveLocalizationKey, type RoomCatalogDefinition } from '../../content';

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
  readonly name: string;
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
 * -- same requirement shape, name resolved from `nameKey` against a
 * locale catalog (defaulting to `en`) since no bundler-loaded translation
 * pipeline exists yet (see `src/content/localization.ts`).
 */
export function roomDefinitionFromCatalog(
  entry: RoomCatalogDefinition,
  locale: ReadonlyMap<string, string> = defaultLocaleEnCatalog,
): RoomDefinition {
  return {
    id: entry.id,
    name: resolveLocalizationKey(locale, entry.nameKey),
    numericId: entry.numericId,
    requirements: entry.requirements,
  };
}

export function buildRoomRegistryFromCatalog(
  entries: readonly RoomCatalogDefinition[] = defaultRoomContentRegistry.all(),
  locale?: ReadonlyMap<string, string>,
): RoomRegistry {
  const registry = new RoomRegistry();
  for (const entry of entries) {
    registry.register(roomDefinitionFromCatalog(entry, locale));
  }
  return registry;
}

/** Built from issue #23's validated content catalog -- see src/content/room-catalog.ts. */
export const defaultRoomRegistry = buildRoomRegistryFromCatalog();
