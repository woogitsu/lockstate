import type { LocalSaveStore, LocalSaveTransaction, PrisonSlotMetadata } from './store';

/**
 * In-memory `LocalSaveStore`. Used by tests to exercise repository policy
 * (generation retention, recovery, autosave coalescing) without a real or
 * polyfilled IndexedDB. Not exported for production use.
 */
export class MemoryLocalSaveStore implements LocalSaveStore {
  private readonly metadata = new Map<string, PrisonSlotMetadata>();
  private readonly generations = new Map<string, unknown>();

  /** Test hook: makes the next `readwrite` transaction throw this error before committing anything. */
  public failNextWrite: Error | undefined;

  public async runTransaction<T>(mode: 'readonly' | 'readwrite', work: (tx: LocalSaveTransaction) => Promise<T>): Promise<T> {
    if (mode === 'readwrite' && this.failNextWrite !== undefined) {
      const error = this.failNextWrite;
      this.failNextWrite = undefined;
      throw error;
    }

    // A real IndexedDB transaction stages writes and only makes them
    // visible on commit; this fake mirrors that by working against copies
    // and only publishing them once `work` resolves without throwing.
    const metadataStaging = new Map(this.metadata);
    const generationsStaging = new Map(this.generations);

    const tx: LocalSaveTransaction = {
      getMetadata: (prisonId) => Promise.resolve(metadataStaging.get(prisonId)),
      listMetadata: () => Promise.resolve([...metadataStaging.values()]),
      putMetadata: (value) => {
        metadataStaging.set(value.prisonId, value);
        return Promise.resolve();
      },
      deleteMetadata: (prisonId) => {
        metadataStaging.delete(prisonId);
        return Promise.resolve();
      },
      getGeneration: (prisonId, generationId) => Promise.resolve(generationsStaging.get(generationKey(prisonId, generationId))),
      putGeneration: (prisonId, generationId, value) => {
        generationsStaging.set(generationKey(prisonId, generationId), value);
        return Promise.resolve();
      },
      deleteGeneration: (prisonId, generationId) => {
        generationsStaging.delete(generationKey(prisonId, generationId));
        return Promise.resolve();
      },
    };

    const result = await work(tx);

    if (mode === 'readwrite') {
      this.metadata.clear();
      for (const [key, value] of metadataStaging) this.metadata.set(key, value);
      this.generations.clear();
      for (const [key, value] of generationsStaging) this.generations.set(key, value);
    }

    return result;
  }
}

function generationKey(prisonId: string, generationId: string): string {
  return `${prisonId}:${generationId}`;
}
