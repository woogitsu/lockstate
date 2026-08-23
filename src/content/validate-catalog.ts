import type { ObjectDefinition } from './object-catalog';
import type { ContentRegistry } from './registry';
import type { RoomCatalogDefinition } from './room-catalog';

export type CatalogCrossReferenceError = {
  readonly kind: 'missing-object-reference';
  readonly roomId: string;
  readonly objectId: string;
};

/**
 * Cross-catalog validation issue #23 requires beyond each catalog's own
 * schema/duplicate checks: every room requirement of type `'object'` must
 * name a real, registered object definition. A dangling reference here
 * would only surface later as a room that can never validate, with no
 * indication why -- this makes it a clear, startup-time error instead.
 */
export function validateRoomObjectReferences(
  rooms: ContentRegistry<RoomCatalogDefinition>,
  objects: ContentRegistry<ObjectDefinition>,
): readonly CatalogCrossReferenceError[] {
  const errors: CatalogCrossReferenceError[] = [];

  for (const room of rooms.all()) {
    for (const requirement of room.requirements) {
      if (requirement.type !== 'object') continue;
      if (!objects.has(requirement.objectId)) {
        errors.push({ kind: 'missing-object-reference', roomId: room.id, objectId: requirement.objectId });
      }
    }
  }

  return errors;
}
