import { z } from 'zod';
import type { PrisonSlotMetadata } from './store';

const pendingSyncSchema = z
  .object({
    dirtySinceRevision: z.number().int().min(0),
    markedAt: z.number().int().min(0),
  })
  .strict();

/**
 * The one persistence boundary that had no schema (#105 finding 14):
 * IndexedDB slot metadata was declared as `PrisonSlotMetadata` by
 * `LocalSaveTransaction` and consumed raw, so the type was an assertion about
 * bytes on a player's disk rather than something checked. Every other stored
 * or transported value here is validated before it is believed -- the save
 * envelope (`save-schema.ts`) and the worker protocol
 * (`src/simulation/protocol/types.ts`) with Zod, the cached entitlement
 * projection (`src/services/entitlements/projection.ts`) with Zod, stored
 * input settings with a hand-written structural check
 * (`src/input/settings.ts`) -- and this boundary now is too, with Zod,
 * matching the two schemas it sits closest to.
 *
 * Generations' own precedent is followed exactly: the store interface returns
 * the record as `unknown` and `PrisonSaveRepository` decodes it, because
 * "what to do with unreadable data" is repository policy.
 *
 * **Deliberately permissive, and why that is not laziness.** This schema is
 * written to accept every record any build of this repository has ever
 * written, because a schema added to an existing store can turn a readable
 * slot into an unreadable one, and that is data loss dressed as validation
 * (`AGENTS.md` boundary 7). Three narrowings that would look natural here are
 * therefore left out on purpose:
 *
 *   * `prisonId`/`gameVersion` are `string().min(1)`, not the envelope's
 *     `identifierSchema`. A slot record's `prisonId` has never been checked
 *     against that pattern on the way in, so narrowing to it here could
 *     refuse a slot that exists today.
 *   * **No `updatedAt >= createdAt` refinement**, which the save envelope
 *     does carry. An envelope's two timestamps are written together and are
 *     self-consistent by construction; a slot's are two independent
 *     `Date.now()` readings taken at create time and at each save, so a
 *     backwards system-clock adjustment between them is possible -- and a
 *     clock change must not make a prison unreadable.
 *   * **No cross-field invariant** (`currentGenerationId` being one of
 *     `generationIds`, or a bound on the window's length). The repository
 *     maintains both, but `loadCurrent` already reads correctly when they
 *     disagree, so enforcing them here would refuse records the existing
 *     code recovers from. Structural validation only, the same division
 *     `worldSnapshotSchema` states for semantic world checks.
 *
 * What it does catch is the boundary's actual failure mode: a record that is
 * not a slot record at all -- a wrong type, a missing or misspelled field, a
 * string where the window of generation ids belongs, an object written by
 * something other than this repository.
 *
 * **No migration is needed and none is added.** `PrisonSlotMetadata` had
 * exactly one shape from when it was introduced until #1097 added
 * `currentRevision`, the database version has never been bumped past 1, and
 * the record's writers are `PrisonSaveRepository` plus the browser harness's
 * seeder -- all of which write this shape. So there is no legacy variant for
 * a step to convert. A field addition follows the envelope's own rule
 * (docs/PERSISTENCE.md, "Adding an optional field without a version bump" --
 * the same rule `construction.currentTransaction` was added under):
 * optional, with absence meaning what the older build already did.
 * `currentRevision` is the instance of that rule: absence means "no
 * generation has landed in this slot since it was written by a build that
 * records this field" -- either a slot that predates it, or the sliver of
 * time between `create()` and the first generation it writes -- and nothing
 * repairs it retroactively; the slot's next durable save populates it.
 */
export const prisonSlotMetadataSchema = z
  .object({
    prisonId: z.string().min(1),
    gameVersion: z.string().min(1),
    displayName: z.string().optional(),
    usesDefaultName: z.literal(true).optional(),
    // `undefined` until the first successful save. Accepted both as an
    // explicit `undefined` (which is what `create()` writes, and what
    // structured clone stores) and as an absent key: the two carry the same
    // fact, no reader distinguishes them, and requiring the key would let any
    // serializer that drops undefined-valued properties turn a readable slot
    // into an unreadable one. `z.union([z.string(), z.undefined()])` does
    // require it -- Zod 4 rejects a missing key there with "expected
    // nonoptional" -- so this is `.optional()` deliberately.
    currentGenerationId: z.string().min(1).optional(),
    generationIds: z.array(z.string().min(1)).readonly(),
    createdAt: z.number().int().min(0),
    updatedAt: z.number().int().min(0),
    pendingSync: pendingSyncSchema.optional(),
    // Optional for the same reason `currentGenerationId` is: absent (or an
    // explicit `undefined`, which `create()` writes) both mean "no generation
    // has landed here yet under this field's own writer" -- see the header
    // comment above and `PrisonSlotMetadata.currentRevision`'s doc comment.
    currentRevision: z.number().int().min(0).optional(),
  })
  .strict();

/**
 * Compile-time proof that the schema and the hand-written interface describe
 * the same record. Without it, the two could drift -- a field added to one and
 * not the other -- and the cast in `requirePrisonSlotMetadata` would hide it,
 * which is exactly the "the type is an assertion, not a check" defect this
 * module exists to remove. Verified to have teeth: adding a field to
 * `PrisonSlotMetadata` alone fails `tsc` here (see the pull request's
 * mutation table).
 *
 * Field names are compared exactly in both directions. Value types are
 * compared through `Comparable`, which normalizes only *optionality*: with
 * `exactOptionalPropertyTypes` on, TypeScript distinguishes `x?: string` from
 * `x?: string | undefined` and Zod always infers the latter, so comparing
 * that modifier would fail on a difference of notation rather than of
 * contract.
 */
type AssertAssignable<Value extends Target, Target> = Value & Target;
type Comparable<T> = { [Key in keyof T]?: T[Key] | undefined };
type StoredSlotRecord = z.infer<typeof prisonSlotMetadataSchema>;
type _SchemaFieldsMatchInterface = AssertAssignable<keyof StoredSlotRecord, keyof PrisonSlotMetadata>;
type _InterfaceFieldsMatchSchema = AssertAssignable<keyof PrisonSlotMetadata, keyof StoredSlotRecord>;
type _SchemaTypesMatchInterface = AssertAssignable<Comparable<StoredSlotRecord>, Comparable<PrisonSlotMetadata>>;
type _InterfaceTypesMatchSchema = AssertAssignable<Comparable<PrisonSlotMetadata>, Comparable<StoredSlotRecord>>;

/**
 * A stored slot record that is not a slot record. Distinct from the
 * `SaveWriteError` codes in `errors.ts`, which describe *storage* failing
 * (quota, aborted transaction): here storage worked and handed back
 * something this repository cannot have written.
 */
export class CorruptSlotMetadataError extends Error {
  public override readonly name = 'CorruptSlotMetadataError';

  public constructor(
    public readonly prisonId: string | undefined,
    public readonly issues: readonly string[],
  ) {
    const slot = prisonId === undefined ? 'A prison slot record' : `The slot record for prison "${prisonId}"`;
    super(`${slot} is unreadable and was left untouched: ${issues.join('; ')}`);
  }
}

function describeIssues(error: z.ZodError): readonly string[] {
  return error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`);
}

/**
 * Validates one stored slot record. `undefined` in means "no such slot" and
 * passes straight through; anything else that fails validation **throws**.
 *
 * Refusing rather than treating a corrupt record as absent is the deliberate
 * choice, and the reason is that "absent" is not a safe synonym here. Elsewhere
 * in this repository it is -- invalid stored input settings and an invalid
 * cached entitlement projection are both read as absent, because absent means
 * "use the defaults" and "assume the free tier", which lose nothing. For a
 * save slot, absent means *there is no such prison*: `create()` treats it as a
 * free slot id, `delete()` as nothing to do, and `list()` would simply stop
 * showing the prison. Treating a damaged record as absent would therefore let
 * the next write overwrite it and orphan its generations, which no code path
 * can then reach or clean up -- the one outcome that turns a damaged index
 * into lost saves.
 *
 * Refusal lands in paths that already exist rather than inventing one:
 * `save()` already catches a throw from inside its transaction and returns a
 * `SaveWriteError`, and `list()`/`loadPrison()` rejections are already
 * rendered by `src/ui/save-panel.ts`. Nothing is deleted, demoted or
 * rewritten -- unlike a generation that fails `decodeSaveEnvelope`, which the
 * repository may demote *because a good generation may remain*. A slot record
 * has no redundant copy, so there is nothing to fall back to and no safe way
 * to discard it.
 *
 * The cost is availability: one damaged record makes `list()` refuse, so the
 * player is told their prison list is unreadable rather than seeing the
 * remaining prisons. That is the conservative end of a genuine trade-off
 * (skipping the bad row would keep the others usable, at the cost of silently
 * hiding a prison whose saves are still on disk) and it is not settled by any
 * existing behaviour, so it is recorded in docs/PERSISTENCE.md as a decision
 * to revisit rather than presented as the only option.
 */
export function decodePrisonSlotMetadata(raw: unknown, prisonId?: string): PrisonSlotMetadata | undefined {
  if (raw === undefined) return undefined;
  return requirePrisonSlotMetadata(raw, prisonId);
}

/**
 * The same validation for a record that came out of `listMetadata()`, where
 * `undefined` is not "no such slot": the store enumerated the record, so it
 * exists and an absent value is itself corruption.
 */
export function requirePrisonSlotMetadata(raw: unknown, prisonId?: string): PrisonSlotMetadata {
  const result = prisonSlotMetadataSchema.safeParse(raw);
  if (!result.success) throw new CorruptSlotMetadataError(prisonId, describeIssues(result.error));
  return result.data as PrisonSlotMetadata;
}

/**
 * Validates a record on the way *in*, so this repository cannot write a slot
 * its own read path would then refuse. Without it, a caller-supplied
 * `prisonId` that the schema rejects (`''`, for instance -- a valid IndexedDB
 * key that `create()` accepted before this change) would produce a slot that
 * could never again be read, loaded or deleted. Cheap enough to run on every
 * write: a slot record is eight scalar fields and a short array of ids, not a
 * multi-megabyte payload, so the trusted-envelope reasoning in
 * `save-schema.ts` does not apply.
 */
export function encodePrisonSlotMetadata(metadata: PrisonSlotMetadata): PrisonSlotMetadata {
  const result = prisonSlotMetadataSchema.safeParse(metadata);
  if (!result.success) throw new CorruptSlotMetadataError(metadata.prisonId, describeIssues(result.error));
  return result.data as PrisonSlotMetadata;
}
