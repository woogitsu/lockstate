import { z } from 'zod';
import { prisonSlotMetadataSchema } from './slot-metadata-schema';
import type { TombstoneRecord } from './store';

/**
 * The stored shape of one deleted prison's undo copy (ADR 0114), validated on
 * the way in and on the way out for `slot-metadata-schema.ts`'s reason: a
 * declared type is an assertion about bytes on a player's disk, not a check
 * (#105 finding 14).
 *
 * ## Why an unreadable tombstone is swept, where an unreadable slot is refused
 *
 * `decodePrisonSlotMetadata` **throws** on a record it cannot read, and
 * `PrisonSaveRepository.list()` lets that refuse the player's whole prison
 * list. Its own header carries the argument: a slot record is the only index to
 * a prison's generations, absent is not a safe synonym for corrupt, and
 * treating a damaged one as absent would let the next write orphan saves
 * nothing can then reach.
 *
 * **None of that holds for a tombstone, and the opposite of each half does.**
 *
 * - It indexes nothing the player still has. The prison it copies is already
 *   deleted; the tombstone is the copy, not the index to one.
 * - It is transient by construction. Every tombstone carries an `expiresAt`
 *   and is swept at the first read past it, so "keep it until somebody
 *   decides" is not a state this record has.
 * - A record this build cannot read is a record this build cannot restore, so
 *   it can never do the one thing it exists to do -- and holding bytes that
 *   can serve no undo is precisely the quota cost the owner's "free it now"
 *   ruling exists to keep off a player's disk.
 *
 * **The tension this leaves, stated rather than hidden.** ADR 0038's rule is
 * that a value the build cannot interpret is a fact about the blob and is
 * refused, not discarded -- and a tombstone written by a *newer* build and read
 * by an older one is exactly that case. It is swept anyway, and the reason is
 * the window: a newer build's tombstone is undoable only until its own
 * `expiresAt`, which the older build cannot read either, so the alternative is
 * not "restore it later" but "hold bytes forever that nothing will ever offer".
 * A generation is refused rather than discarded because a save is meant to
 * outlive builds. An undo window is meant to close.
 */
const tombstoneGenerationSchema = z
  .object({
    generationId: z.string().min(1),
    // Opaque: what storage handed back for this generation, moved verbatim.
    // `PrisonSaveRepository` validates a generation with `decodeSaveEnvelope`
    // at the moment it is read for a load, exactly as it does for one that was
    // never deleted -- so validating it a second time here would be a second
    // opinion about the save format living in the wrong layer.
    value: z.unknown(),
  })
  .strict();

export const tombstoneRecordSchema = z
  .object({
    prisonId: z.string().min(1),
    metadata: prisonSlotMetadataSchema,
    generations: z.array(tombstoneGenerationSchema).readonly(),
    deletedAt: z.number().int().min(0),
    expiresAt: z.number().int().min(0),
  })
  .strict();

/**
 * Compile-time proof that the schema and the hand-written interface describe the
 * same record, on `slot-metadata-schema.ts`'s pattern and for its reason: without
 * it a field could be added to one and not the other, and the cast below would
 * hide it.
 */
type AssertAssignable<Value extends Target, Target> = Value & Target;
type Comparable<T> = { [Key in keyof T]?: T[Key] | undefined };
type StoredTombstone = z.infer<typeof tombstoneRecordSchema>;
type _SchemaFieldsMatchInterface = AssertAssignable<keyof StoredTombstone, keyof TombstoneRecord>;
type _InterfaceFieldsMatchSchema = AssertAssignable<keyof TombstoneRecord, keyof StoredTombstone>;
type _SchemaTypesMatchInterface = AssertAssignable<Comparable<Pick<StoredTombstone, 'prisonId' | 'deletedAt' | 'expiresAt'>>, Comparable<Pick<TombstoneRecord, 'prisonId' | 'deletedAt' | 'expiresAt'>>>;

/**
 * One stored tombstone, or `undefined` if it is not one.
 *
 * `undefined` in means "no such tombstone" and passes straight through, exactly
 * as `decodePrisonSlotMetadata`'s does. Unlike that function, a record that
 * fails validation also answers `undefined` rather than throwing -- see this
 * module's header for the three reasons a tombstone is not a slot record. Every
 * caller that gets `undefined` for a record the store did enumerate deletes it
 * in the same transaction, so "cannot be read" never becomes "held for ever".
 */
export function decodeTombstoneRecord(raw: unknown): TombstoneRecord | undefined {
  if (raw === undefined) return undefined;
  const result = tombstoneRecordSchema.safeParse(raw);
  return result.success ? (result.data as TombstoneRecord) : undefined;
}

/**
 * The key an unreadable record is filed under, so a sweep can delete it.
 *
 * The `tombstones` store's `keyPath` is `prisonId`, so a record that is in the
 * store at all has a `prisonId` the store itself read to file it -- but the
 * record has just failed validation, so nothing about it may be assumed. A
 * record whose `prisonId` is not a non-empty string is left alone and reported
 * as unkeyable: it cannot be deleted by key, and inventing a key for it would
 * delete some other prison's copy.
 */
export function tombstoneKeyOf(raw: unknown): string | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const candidate = (raw as { prisonId?: unknown }).prisonId;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}

/**
 * Validates a tombstone on the way *in*, so this repository cannot write one its
 * own read path would then sweep. `encodePrisonSlotMetadata`'s argument exactly,
 * with one difference that matters: a slot record is eight scalars, and a
 * tombstone carries up to five save payloads. `z.unknown()` on
 * `generations[].value` is what keeps this cheap -- Zod accepts the value
 * without walking it, so the cost is the slot record's cost plus one array
 * length, not a re-validation of every megabyte the copy holds.
 */
export function encodeTombstoneRecord(tombstone: TombstoneRecord): TombstoneRecord {
  const result = tombstoneRecordSchema.safeParse(tombstone);
  if (!result.success) {
    throw new Error(
      `Refusing to write an unreadable tombstone for prison "${tombstone.prisonId}": ${result.error.issues
        .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
        .join('; ')}`,
    );
  }
  return result.data as TombstoneRecord;
}
