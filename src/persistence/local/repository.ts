import { decodeSaveEnvelope, decodeSaveEnvelopeUnlessTrusted, type SaveEnvelope } from '../save-schema';
import { applyGenerationRetention } from './generation-policy';
import { classifyStoreError, type SaveWriteError } from './errors';
import type { LocalSaveStore, PendingSyncState, PrisonSlotMetadata } from './store';

export type SaveResult =
  | { readonly ok: true; readonly generationId: string }
  | { readonly ok: false; readonly error: SaveWriteError };

export type LoadRecoveryOutcome = 'current' | 'recovered-previous';

export type LoadResult =
  | { readonly ok: true; readonly envelope: SaveEnvelope; readonly generationId: string; readonly outcome: LoadRecoveryOutcome }
  | { readonly ok: false; readonly reason: 'not-found' | 'no-valid-generation' };

export interface CreatePrisonInput {
  readonly prisonId: string;
  readonly gameVersion: string;
  readonly displayName?: string;
}

export interface PrisonSaveRepositoryOptions {
  /** Current generation plus this many previous safe copies. Default 3 (current + 2 previous, matching the issue's minimum). */
  readonly keepGenerations?: number;
  readonly now?: () => number;
  readonly generateGenerationId?: () => string;
}

let generationSequence = 0;
function defaultGenerationId(): string {
  generationSequence += 1;
  return `gen-${Date.now().toString(36)}-${generationSequence.toString(36)}`;
}

/**
 * Local-first save repository. All policy — generation retention, startup
 * recovery, export/import validation — lives here against the storage-
 * agnostic `LocalSaveStore`, so it is fully testable with the in-memory
 * fake (see memory-store.ts) independent of any real or polyfilled
 * IndexedDB. Settings/accessibility preferences (src/input/storage.ts) and
 * Supabase sync execution (#20) are deliberately separate concerns.
 */
export class PrisonSaveRepository {
  private readonly keepGenerations: number;
  private readonly now: () => number;
  private readonly generateGenerationId: () => string;

  public constructor(
    private readonly store: LocalSaveStore,
    options: PrisonSaveRepositoryOptions = {},
  ) {
    this.keepGenerations = options.keepGenerations ?? 3;
    this.now = options.now ?? Date.now;
    this.generateGenerationId = options.generateGenerationId ?? defaultGenerationId;
  }

  public async list(): Promise<readonly PrisonSlotMetadata[]> {
    return this.store.runTransaction('readonly', (tx) => tx.listMetadata());
  }

  public async create(input: CreatePrisonInput): Promise<PrisonSlotMetadata> {
    return this.store.runTransaction('readwrite', async (tx) => {
      const existing = await tx.getMetadata(input.prisonId);
      if (existing !== undefined) {
        throw new Error(`Prison "${input.prisonId}" already exists.`);
      }
      const timestamp = this.now();
      const metadata: PrisonSlotMetadata = {
        prisonId: input.prisonId,
        gameVersion: input.gameVersion,
        currentGenerationId: undefined,
        generationIds: [],
        createdAt: timestamp,
        updatedAt: timestamp,
        ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
      };
      await tx.putMetadata(metadata);
      return metadata;
    });
  }

  public async delete(prisonId: string): Promise<void> {
    await this.store.runTransaction('readwrite', async (tx) => {
      const metadata = await tx.getMetadata(prisonId);
      if (metadata === undefined) return;
      for (const generationId of metadata.generationIds) {
        await tx.deleteGeneration(prisonId, generationId);
      }
      await tx.deleteMetadata(prisonId);
    });
  }

  /**
   * Writes a new generation and atomically advances the current-generation
   * pointer. A prior good generation is only deleted after the new one and
   * the updated pointer are staged in the same transaction, so a failed
   * write can never destroy the last known-good generation.
   *
   * Validation is provenance-based, not caller-declared (#49): an envelope
   * this process itself built (`createSaveEnvelope`) or already decoded
   * (`decodeSaveEnvelope`, i.e. the import/load paths) is written as-is,
   * because re-walking a payload this process validated moments ago was
   * measured as roughly a third of an autosave. Every other envelope — an
   * import, a value read back from storage, anything that crossed a process
   * or serialization boundary, and anything merely *cast* to the trusted type
   * — is still fully validated here before it can reach storage.
   */
  public async save(prisonId: string, envelope: SaveEnvelope): Promise<SaveResult> {
    const decoded = decodeSaveEnvelopeUnlessTrusted(envelope);
    if (!decoded.ok) {
      return { ok: false, error: { code: 'unknown-error', message: `Refusing to persist an invalid envelope: ${decoded.error.message}` } };
    }

    const generationId = this.generateGenerationId();

    try {
      await this.store.runTransaction('readwrite', async (tx) => {
        const metadata = await tx.getMetadata(prisonId);
        if (metadata === undefined) {
          throw new Error(`Prison "${prisonId}" does not exist. Call create() first.`);
        }

        await tx.putGeneration(prisonId, generationId, decoded.value);

        const retention = applyGenerationRetention(metadata.generationIds, generationId, this.keepGenerations);
        await tx.putMetadata({
          ...metadata,
          currentGenerationId: generationId,
          generationIds: retention.generationIds,
          updatedAt: this.now(),
        });

        for (const staleGenerationId of retention.toDelete) {
          await tx.deleteGeneration(prisonId, staleGenerationId);
        }
      });
    } catch (error) {
      return { ok: false, error: classifyStoreError(error) };
    }

    return { ok: true, generationId };
  }

  /**
   * Startup recovery policy: try the current generation first; if it is
   * missing or fails schema/checksum validation, walk the remaining
   * generations newest-first and adopt the first one that validates,
   * updating the pointer so the corrupt generation is not retried on every
   * boot. Returns `no-valid-generation` only when nothing in the retained
   * window validates.
   */
  public async loadCurrent(prisonId: string): Promise<LoadResult> {
    const metadata = await this.store.runTransaction('readonly', (tx) => tx.getMetadata(prisonId));
    if (metadata === undefined) return { ok: false, reason: 'not-found' };

    const candidates = [...metadata.generationIds].reverse(); // newest first
    for (const generationId of candidates) {
      const raw = await this.store.runTransaction('readonly', (tx) => tx.getGeneration(prisonId, generationId));
      const decoded = raw === undefined ? undefined : decodeSaveEnvelope(raw);
      if (decoded?.ok !== true) continue;

      if (generationId !== metadata.currentGenerationId) {
        await this.recoverToGeneration(prisonId, generationId, candidates);
      }

      return {
        ok: true,
        envelope: decoded.value,
        generationId,
        outcome: generationId === metadata.currentGenerationId ? 'current' : 'recovered-previous',
      };
    }

    return { ok: false, reason: 'no-valid-generation' };
  }

  private async recoverToGeneration(
    prisonId: string,
    recoveredGenerationId: string,
    triedNewestFirst: readonly string[],
  ): Promise<void> {
    // Everything newer than the recovered generation was confirmed invalid above; drop it.
    const recoveredIndex = triedNewestFirst.indexOf(recoveredGenerationId);
    const confirmedInvalid = triedNewestFirst.slice(0, recoveredIndex);

    await this.store.runTransaction('readwrite', async (tx) => {
      const metadata = await tx.getMetadata(prisonId);
      if (metadata === undefined) return;
      await tx.putMetadata({
        ...metadata,
        currentGenerationId: recoveredGenerationId,
        generationIds: metadata.generationIds.filter((id) => !confirmedInvalid.includes(id)),
      });
      for (const invalidId of confirmedInvalid) {
        await tx.deleteGeneration(prisonId, invalidId);
      }
    });
  }

  public async exportSave(prisonId: string): Promise<SaveEnvelope | undefined> {
    const result = await this.loadCurrent(prisonId);
    return result.ok ? result.envelope : undefined;
  }

  /** Validates `raw` through schema/migration/checksum (#18) before it ever reaches storage. */
  public async importSave(prisonId: string, raw: unknown): Promise<SaveResult> {
    const decoded = decodeSaveEnvelope(raw);
    if (!decoded.ok) {
      return { ok: false, error: { code: 'unknown-error', message: `Import rejected: ${decoded.error.message}` } };
    }
    return this.save(prisonId, decoded.value);
  }

  public async markPendingSync(prisonId: string, pendingSync: PendingSyncState): Promise<void> {
    await this.store.runTransaction('readwrite', async (tx) => {
      const metadata = await tx.getMetadata(prisonId);
      if (metadata === undefined) throw new Error(`Prison "${prisonId}" does not exist.`);
      await tx.putMetadata({ ...metadata, pendingSync });
    });
  }

  public async clearPendingSync(prisonId: string): Promise<void> {
    await this.store.runTransaction('readwrite', async (tx) => {
      const metadata = await tx.getMetadata(prisonId);
      if (metadata === undefined) throw new Error(`Prison "${prisonId}" does not exist.`);
      const { pendingSync: _omit, ...rest } = metadata;
      await tx.putMetadata(rest);
    });
  }
}
