import { z } from 'zod';
import type { JsonValue } from '../shared/json';
import {
  type DeepReadonly,
  identifierSchema,
  jsonValueSchema,
  sequenceSchema,
  tickSchema,
  uint32Schema,
} from '../simulation/protocol/types';
import { WORLD_SNAPSHOT_VERSION } from '../simulation/world/sparse-world';
import { MigrationChain, type MigrationError, type MigrationErrorCode } from './migration';
import { zodVersionSchema } from './zod-version-schema';
import { computeSaveChecksum } from './checksum';
import type { EncodedEntityStoreSnapshot } from './entity-codec';
import { migrateSaveEnvelopeV1ToV2 } from './save-migrations';
import type { KernelSnapshot } from '../simulation/kernel/kernel';
import type { WorldSnapshotV1 } from '../simulation/world/sparse-world';
import type { ConstructionSnapshot } from '../simulation/construction/system';

/** The version every newly written save carries. Older versions are still readable via `saveMigrationChain`. */
export const SAVE_SCHEMA_VERSION = 2 as const;

// --- Kernel / RNG ---

const rngWordsSchema = z.tuple([uint32Schema, uint32Schema, uint32Schema, uint32Schema]);

const namedRngStreamStateSchema = z
  .object({
    name: z.string().min(1),
    state: z
      .object({
        algorithm: z.literal('xoshiro128**'),
        version: z.literal(1),
        words: rngWordsSchema,
      })
      .strict(),
  })
  .strict();

const queuedCommandSchema = z
  .object({
    id: identifierSchema,
    sequence: sequenceSchema,
    executeAtTick: tickSchema,
    payload: jsonValueSchema,
  })
  .strict();

const kernelSnapshotSchema = z
  .object({
    tick: tickSchema,
    expectedSequence: sequenceSchema,
    rngStates: z.array(namedRngStreamStateSchema),
    commands: z.array(queuedCommandSchema),
  })
  .strict();

// --- World ---
// Structural validation only. Semantic decoding (RLE-length-vs-chunk-size
// consistency, duplicate-chunk detection, parcel/ownership cross-checks) is
// already implemented by `SparseWorld.fromSnapshot` and is not duplicated
// here; the save boundary rejects malformed shapes before that step runs.

const chunkPositionSchema = z.object({ x: z.number().int(), y: z.number().int() }).strict();

const terrainRleSchema = z.array(z.tuple([z.number().int().min(0).max(255), z.number().int().positive()]));

const serializedChunkStateSchema = z
  .object({
    x: z.number().int(),
    y: z.number().int(),
    lifecycle: z.enum(['metadata-only', 'loaded']),
    geometryRevision: z.number().int().min(0),
    contentRevision: z.number().int().min(0),
    dirty: z.boolean(),
    terrain: terrainRleSchema.optional(),
    topEdge: terrainRleSchema.optional(),
    leftEdge: terrainRleSchema.optional(),
    zoning: terrainRleSchema.optional(),
  })
  .strict();

const serializedParcelSchema = z
  .object({
    id: z.string().min(1),
    x: z.number().int(),
    y: z.number().int(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    basePrice: z.number(),
    name: z.string().optional(),
  })
  .strict();

const worldSnapshotSchema = z
  .object({
    version: z.literal(WORLD_SNAPSHOT_VERSION),
    chunkSize: z.number().int().positive(),
    ownedChunks: z.array(chunkPositionSchema),
    chunks: z.array(serializedChunkStateSchema),
    parcels: z.array(serializedParcelSchema).optional(),
    ownedParcels: z.array(z.string()).optional(),
  })
  .strict();

// --- Construction ("pending work") ---

const buildOrderMaterialSchema = z.object({ itemId: z.string().min(1), quantity: z.number().int().min(0) }).strict();

const buildOrderSchema = z
  .object({
    id: z.string().min(1),
    definitionId: z.string().min(1),
    location: z.object({ x: z.number().int(), y: z.number().int() }).strict(),
    /**
     * Which tile edge the order occupies (#74). `'north'`/`'west'` are the two
     * edge slots `SparseWorld` stores; see
     * `src/simulation/construction/build-order.ts`.
     *
     * Optional, and **not** a version bump. The schema is `.strict()`, so a
     * key it does not name is rejected outright — an order carrying an edge
     * could not be saved at all until this line existed. Because it is
     * optional it is equally valid in the V1 and V2 payload shapes above: an
     * older save simply never has it and resolves to the documented default,
     * so no migration step is needed and none is added.
     */
    edge: z.enum(['north', 'west']).optional(),
    state: z.enum([
      'planned',
      'approved',
      'materials-pending',
      'assigned',
      'in-progress',
      'completed',
      'cancelled',
      'failed',
    ]),
    progress: z.number().min(0),
    materialsAllocated: z.array(buildOrderMaterialSchema),
    assignedWorkerId: z.string().optional(),
    failReason: z.string().optional(),
  })
  .strict();

const constructionSnapshotSchema = z
  .object({
    orders: z.array(buildOrderSchema),
    undoStack: z.array(z.array(z.string())),
    redoStack: z.array(z.array(z.string())),
  })
  .strict();

// --- Entities ---
// Entity-ID liveness only; see entity-codec.ts for why per-component state
// is still excluded.
//
// V1 wrote the store's three parallel arrays at its full allocated
// `capacity`. This schema is frozen historical shape: it exists only so the
// migration chain can validate a save written by an older build before
// upgrading it, and must never be edited to match new code.

const entityStoreSnapshotV1Schema = z
  .object({
    capacity: z.number().int().min(0),
    nextAvailableIndex: z.number().int().min(0),
    maxActiveIndex: z.number().int().min(-1),
    freeCount: z.number().int().min(0),
    generations: z.array(z.number().int().min(0).max(0xffff)),
    freeIndices: z.array(z.number().int().min(0).max(0xffff_ffff)),
    alive: z.array(z.union([z.literal(0), z.literal(1)])),
  })
  .strict();

/**
 * V2 (#50): population-shaped rather than capacity-shaped. `generations` and
 * `alive` are `[value, length]` run arrays; `freeIndices` carries exactly the
 * live free-list prefix, so `freeCount` is `freeIndices.length` and no longer
 * has its own field to disagree with. See `entity-codec.ts` for why.
 */
const entityLivenessRunSchema = <Value extends z.ZodTypeAny>(value: Value) =>
  z.tuple([value, z.number().int().positive()]);

const entityStoreSnapshotV2Schema = z
  .object({
    capacity: z.number().int().min(0).max(0xf_ffff),
    nextAvailableIndex: z.number().int().min(0),
    maxActiveIndex: z.number().int().min(-1),
    generations: z.array(entityLivenessRunSchema(z.number().int().min(0).max(0xffff))),
    freeIndices: z.array(z.number().int().min(0)),
    alive: z.array(entityLivenessRunSchema(z.union([z.literal(0), z.literal(1)]))),
  })
  .strict()
  .superRefine((value, ctx) => {
    // Cross-field consistency the field schemas cannot express. Checked here
    // rather than left to `decodeEntityStoreSnapshot` so a malformed save is
    // rejected at the save boundary with an `invalid-shape` error, instead of
    // throwing out of a restore half-way through rebuilding the store.
    const total = (runs: readonly (readonly [number, number])[]): number =>
      runs.reduce((sum, [, length]) => sum + length, 0);

    for (const field of ['generations', 'alive'] as const) {
      const covered = total(value[field]);
      if (covered !== value.capacity) {
        ctx.addIssue({ code: 'custom', message: `Runs cover ${covered} slots but capacity is ${value.capacity}.`, path: [field] });
      }
    }
    if (value.nextAvailableIndex > value.capacity) {
      ctx.addIssue({ code: 'custom', message: 'nextAvailableIndex must not exceed capacity.', path: ['nextAvailableIndex'] });
    }
    if (value.maxActiveIndex >= value.capacity) {
      ctx.addIssue({ code: 'custom', message: 'maxActiveIndex must be below capacity.', path: ['maxActiveIndex'] });
    }
    if (value.freeIndices.length > value.capacity) {
      ctx.addIssue({ code: 'custom', message: 'The free list must not be longer than capacity.', path: ['freeIndices'] });
    }
    for (const [position, index] of value.freeIndices.entries()) {
      if (index >= value.capacity) {
        ctx.addIssue({ code: 'custom', message: `Free-list entry ${index} is outside capacity ${value.capacity}.`, path: ['freeIndices', position] });
      }
    }
  });

// --- Envelope ---

const savePayloadV1Schema = z
  .object({
    kernel: kernelSnapshotSchema,
    world: worldSnapshotSchema,
    construction: constructionSnapshotSchema,
    entities: entityStoreSnapshotV1Schema.optional(),
  })
  .strict();

const savePayloadV2Schema = z
  .object({
    kernel: kernelSnapshotSchema,
    world: worldSnapshotSchema,
    construction: constructionSnapshotSchema,
    entities: entityStoreSnapshotV2Schema.optional(),
  })
  .strict();

/** Historical V1 payload shape, retained so V1 saves can still be validated and migrated. */
export type SavePayloadV1 = DeepReadonly<z.infer<typeof savePayloadV1Schema>>;
export type SavePayloadV2 = DeepReadonly<z.infer<typeof savePayloadV2Schema>>;
/** The payload shape newly written saves use. Prefer this over the versioned alias at call sites that just mean "a save payload". */
export type SavePayload = SavePayloadV2;

/**
 * The envelope's own fields, without `payload`. Kept separate so the two
 * halves of an envelope can be validated independently: composing a save
 * in-process already knows its payload is schema-valid (it just parsed it),
 * and re-walking a multi-megabyte payload only to check seven scalar
 * metadata fields was measured as roughly a third of a save (#49).
 *
 * Parameterised by version because every historical envelope schema pins its
 * own `saveSchemaVersion` literal; only the version field differs between
 * them, so the remaining six rules cannot drift apart across versions.
 */
function saveEnvelopeMetadataShape<Version extends number>(version: Version) {
  return {
    saveSchemaVersion: z.literal(version),
    gameVersion: identifierSchema,
    prisonId: identifierSchema,
    revision: z.number().int().min(0),
    createdAt: z.number().int().min(0),
    updatedAt: z.number().int().min(0),
    checksum: z.string().regex(/^[0-9a-f]{16}$/),
  } as const;
}

function withOrderedTimestamps<T extends { readonly createdAt: number; readonly updatedAt: number }>(
  schema: z.ZodType<T>,
): z.ZodType<T> {
  return schema.superRefine((value, ctx) => {
    if (value.updatedAt < value.createdAt) {
      ctx.addIssue({ code: 'custom', message: 'updatedAt must not precede createdAt.', path: ['updatedAt'] });
    }
  });
}

const saveEnvelopeV1ObjectSchema = z
  .object({ ...saveEnvelopeMetadataShape(1), payload: savePayloadV1Schema })
  .strict();

const saveEnvelopeV1Schema = withOrderedTimestamps(saveEnvelopeV1ObjectSchema);

const saveEnvelopeV2ObjectSchema = z
  .object({ ...saveEnvelopeMetadataShape(SAVE_SCHEMA_VERSION), payload: savePayloadV2Schema })
  .strict();

const saveEnvelopeV2Schema = withOrderedTimestamps(saveEnvelopeV2ObjectSchema);

/** Validates only the envelope's own fields; `payload` is validated separately by `savePayloadV2Schema`. */
const saveEnvelopeMetadataV2Schema = withOrderedTimestamps(
  z.object(saveEnvelopeMetadataShape(SAVE_SCHEMA_VERSION)).strict(),
);

/** Historical V1 envelope shape. Only the migration chain and `migrateSaveEnvelopeV1ToV2` should name this. */
export type SaveEnvelopeV1 = DeepReadonly<z.infer<typeof saveEnvelopeV1ObjectSchema>>;
export type SaveEnvelopeV2 = DeepReadonly<z.infer<typeof saveEnvelopeV2ObjectSchema>>;
/**
 * The envelope shape newly written saves use. Call sites that simply mean "a
 * save envelope" use this alias, so the next version bump does not sweep a
 * rename through the repository the way bumping to V2 did.
 */
export type SaveEnvelope = SaveEnvelopeV2;

// --- Migration chain ---
// Every historical version registers its schema once and is never edited;
// each Vn -> Vn+1 transformation registers exactly one step. `MigrationChain`
// itself is additionally exercised end-to-end (multi-hop walking, per-step
// validation, immutability) against synthetic versions in
// tests/unit/persistence-migration.test.ts.
export const saveMigrationChain = new MigrationChain(SAVE_SCHEMA_VERSION);
saveMigrationChain.registerSchema(zodVersionSchema(1, saveEnvelopeV1Schema));
saveMigrationChain.registerSchema(zodVersionSchema(SAVE_SCHEMA_VERSION, saveEnvelopeV2Schema));
saveMigrationChain.registerMigration({
  fromVersion: 1,
  toVersion: 2,
  migrate: (input) => migrateSaveEnvelopeV1ToV2(input as SaveEnvelopeV1),
});

export type SaveDecodeErrorCode = MigrationErrorCode | 'checksum-mismatch';

export interface SaveDecodeError extends Omit<MigrationError, 'code'> {
  readonly code: SaveDecodeErrorCode;
}

export type SaveDecodeResult =
  | { readonly ok: true; readonly value: TrustedSaveEnvelope; readonly migrated: boolean }
  | { readonly ok: false; readonly error: SaveDecodeError };

// --- Trusted envelopes (#49) ---
//
// Validating a save payload is the dominant cost of saving (Zod, not I/O:
// `JSON.stringify` is ~2% of a save). The payload used to be walked three
// times per save -- once by `savePayloadV1Schema`, again by the envelope
// schema that nests it, and a third time by `PrisonSaveRepository.save`
// re-decoding an envelope this same process had just built and checksummed.
//
// That third walk is nonetheless a real correctness boundary for envelopes of
// unknown provenance (imports, restored files, anything read back from
// storage), so it is not removed -- it is made conditional on *provenance*,
// which is established here and nowhere else:
//
//   * `TrustedSaveEnvelope` is a branded type whose brand key is a
//     module-private `unique symbol`. No other module can name it, so no
//     other module can produce that type except by receiving one from this
//     module's `createSaveEnvelope`/`decodeSaveEnvelope`. Trust is therefore
//     carried by the type, not by a boolean a caller could wrongly pass.
//
//   * The brand is backed at runtime by `trustedEnvelopes`, a module-private
//     `WeakSet` keyed on object identity. A caller who defeats the type with
//     `as TrustedSaveEnvelope` still fails the runtime membership check and
//     gets full validation: the type is the contract, the WeakSet is what
//     makes it unforgeable, and the failure mode is "validate anyway".
//
//   * Membership is identity-based, so every ordinary way a value can leave
//     this process and come back -- JSON round trip, structured clone (the
//     IndexedDB write path), a spread that rewrites a field -- yields a
//     *different* object that is not in the set and is fully validated. The
//     trusted path cannot be entered by accident from untrusted input.
//
//   * A trusted envelope is shallow-frozen, so its checksum, its version and
//     its `payload` reference cannot be swapped after this module vouched for
//     them.

declare const trustedSaveEnvelopeBrand: unique symbol;

/**
 * A current-version `SaveEnvelope` whose payload **this process** has already
 * validated and checksum-verified: either freshly composed by
 * `createSaveEnvelope`, or decoded (and, for an older save, migrated) from an
 * untrusted source by `decodeSaveEnvelope`. Only this module can produce one;
 * see the note above for why that cannot be forged.
 */
export type TrustedSaveEnvelope = SaveEnvelope & {
  readonly [trustedSaveEnvelopeBrand]: 'validated-in-process';
};

const trustedEnvelopes = new WeakSet<object>();

function markTrusted(envelope: SaveEnvelope): TrustedSaveEnvelope {
  // Shallow: the payload's interior is already detached from live runtime
  // state (Zod's parse returns a fresh value), and deep-freezing a
  // multi-megabyte payload would reintroduce exactly the per-node walk this
  // change exists to remove.
  const frozen = Object.freeze(envelope);
  trustedEnvelopes.add(frozen);
  return frozen as TrustedSaveEnvelope;
}

/** True only for an envelope object this process itself validated. Identity-based; a copy of a trusted envelope is not trusted. */
export function isTrustedSaveEnvelope(envelope: SaveEnvelope): envelope is TrustedSaveEnvelope {
  return trustedEnvelopes.has(envelope);
}

/**
 * The write-path validation gate. An envelope this process vouched for is
 * accepted as-is; anything else -- including a value merely *typed* as
 * trusted -- is fully decoded (schema, migration and checksum) exactly as
 * before.
 */
export function decodeSaveEnvelopeUnlessTrusted(envelope: SaveEnvelope): SaveDecodeResult {
  if (isTrustedSaveEnvelope(envelope)) return { ok: true, value: envelope, migrated: false };
  return decodeSaveEnvelope(envelope);
}

function extractDeclaredVersion(input: unknown): number | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  const value = (input as Record<string, unknown>).saveSchemaVersion;
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

/**
 * Validates, migrates and checksum-verifies an arbitrary value into the
 * current `SaveEnvelope` contract. Unknown or future versions, structural
 * corruption and checksum mismatches each fail with a distinct, actionable
 * error code.
 */
export function decodeSaveEnvelope(input: unknown): SaveDecodeResult {
  const declaredVersion = extractDeclaredVersion(input);
  if (declaredVersion === undefined) {
    return {
      ok: false,
      error: { code: 'invalid-shape', message: 'Save envelope is missing a numeric saveSchemaVersion.' },
    };
  }

  const migrationResult = saveMigrationChain.migrate<SaveEnvelope>(input, declaredVersion);
  if (!migrationResult.ok) return { ok: false, error: migrationResult.error };

  // The checksum covers the payload, and a migration may rewrite the payload
  // (V1 -> V2 re-encodes entity liveness, #50). So it is verified against the
  // payload it was actually computed over: the save exactly as written, at
  // the version it declared, before any step ran. Verifying it after
  // migration instead would either report every older save as corrupt, or --
  // if the migration recomputed it first -- report every older save as intact
  // whether or not it was. `declaredValue` is the chain's own parsed value,
  // not the caller's object, so this reads validated data.
  const asWritten = migrationResult.declaredValue as { readonly checksum: string; readonly payload: JsonValue };
  if (asWritten.checksum !== computeSaveChecksum(asWritten.payload)) {
    return {
      ok: false,
      error: {
        code: 'checksum-mismatch',
        message: 'Save checksum does not match its payload; the save is corrupt.',
        atVersion: declaredVersion,
      },
    };
  }

  // `envelope` is the migration chain's own freshly parsed value, never the
  // caller's object, so marking it trusted cannot hand out trust for a value
  // an untrusted caller still holds a mutable reference to.
  return { ok: true, value: markTrusted(migrationResult.value), migrated: migrationResult.stepsApplied > 0 };
}

export interface CreateSaveEnvelopeInput {
  readonly gameVersion: string;
  readonly prisonId: string;
  readonly revision: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly kernel: KernelSnapshot;
  readonly world: WorldSnapshotV1;
  readonly construction: ConstructionSnapshot;
  /**
   * Already-encoded entity liveness (`encodeEntityStoreSnapshot`), matching
   * the other three fields, which are JSON-safe snapshots too. A caller
   * holding a live `EntityStoreSnapshot` encodes it first; the session
   * controller already receives this form over the worker protocol, so
   * accepting it here removes a re-encode (and the cast that hid it).
   */
  readonly entities?: EncodedEntityStoreSnapshot;
}

/**
 * Composes a fresh, checksummed, schema-valid current-version envelope from
 * live runtime snapshots.
 *
 * The payload is validated **exactly once** here. The envelope's own fields
 * are validated separately by `saveEnvelopeMetadataV2Schema`, which does not
 * re-walk the payload it was just handed; the composed result is then marked
 * trusted so `PrisonSaveRepository.save` does not walk it a third time (#49).
 *
 * Throws (Zod) on an invalid payload or invalid envelope metadata, exactly as
 * before — validity is still proven, just not proven repeatedly.
 */
export function createSaveEnvelope(input: CreateSaveEnvelopeInput): TrustedSaveEnvelope {
  const payload = savePayloadV2Schema.parse({
    kernel: input.kernel,
    world: input.world,
    construction: input.construction,
    ...(input.entities === undefined ? {} : { entities: input.entities }),
  });

  const metadata = saveEnvelopeMetadataV2Schema.parse({
    saveSchemaVersion: SAVE_SCHEMA_VERSION,
    gameVersion: input.gameVersion,
    prisonId: input.prisonId,
    revision: input.revision,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    checksum: computeSaveChecksum(payload as JsonValue),
  });

  return markTrusted({ ...metadata, payload } as SaveEnvelope);
}
