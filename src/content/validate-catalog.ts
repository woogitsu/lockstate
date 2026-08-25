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
 *
 * This module used to carry a second, unrelated half: the textual scan that
 * reads the simulation's enum declarations out of source so
 * `src/content/simulation-message-keys.ts` can be held to them. That work is
 * static analysis of repository files, it had no importer anywhere in `src/`,
 * and keeping it here meant it needed its own comment stripper -- a two-regex
 * `stripSourceComments` with the defect #278 reported, which blanked 81 lines
 * of real code across the 141 files the scan reads. #307 moved it to
 * `tests/helpers/simulation-enum-source.ts`, where it shares the single-pass
 * `stripComments` that `tests/foundation/comment-stripping-contract.test.ts`
 * pins, and where a scanner of that size costs the client bundle nothing.
 * What is left below is the part that is genuinely about the shipped
 * catalogs.
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
