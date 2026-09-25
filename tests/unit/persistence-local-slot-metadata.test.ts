import { describe, expect, it } from 'vitest';
import { MemoryLocalSaveStore } from '../../src/persistence/local/memory-store';
import { PrisonSaveRepository } from '../../src/persistence/local/repository';
import {
  CorruptSlotMetadataError,
  decodePrisonSlotMetadata,
  encodePrisonSlotMetadata,
  prisonSlotMetadataSchema,
} from '../../src/persistence/local/slot-metadata-schema';
import type { PrisonSlotMetadata } from '../../src/persistence/local/store';
import { createSaveEnvelope } from '../../src/persistence/save-schema';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { ConstructionSystem } from '../../src/simulation/construction/system';
import { chunkCoordinate } from '../../src/simulation/world/coordinates';

/** A genuinely valid envelope, so a refused save is refused by the slot record and nothing else. */
function buildEnvelope(prisonId: string) {
  const world = new SparseWorld(32);
  world.setOwned({ x: chunkCoordinate(0), y: chunkCoordinate(0) }, true);
  const construction = new ConstructionSystem(world);
  const kernel = new Kernel(1, 0);
  return createSaveEnvelope({
    gameVersion: 'lockstate-0.0.0',
    prisonId,
    revision: 1,
    createdAt: 0,
    updatedAt: 1,
    kernel: kernel.snapshot(),
    world: world.snapshot(),
    construction: construction.snapshot(),
  });
}

/** Exactly what `PrisonSaveRepository.create` writes for a fresh slot. */
function freshSlotRecord(prisonId = 'prison-1'): Record<string, unknown> {
  return {
    prisonId,
    gameVersion: 'lockstate-0.0.0',
    currentGenerationId: undefined,
    generationIds: [],
    createdAt: 1_000,
    updatedAt: 1_000,
  };
}

/** Writes a record the typed API would never produce, the way a corrupt or foreign record would arrive. */
async function seedRawSlotRecord(store: MemoryLocalSaveStore, record: unknown): Promise<void> {
  await store.runTransaction('readwrite', async (tx) => {
    await tx.putMetadata(record as PrisonSlotMetadata);
  });
}

async function readRawSlotRecord(store: MemoryLocalSaveStore, prisonId: string): Promise<unknown> {
  return store.runTransaction('readonly', (tx) => tx.getMetadata(prisonId));
}

describe('prisonSlotMetadataSchema: accepts every record this repository has ever written', () => {
  it('accepts a fresh slot, whose current-generation pointer is an explicit undefined', () => {
    expect(prisonSlotMetadataSchema.safeParse(freshSlotRecord()).success).toBe(true);
  });

  it('accepts the optional stable default-name marker and rejects non-marker text', () => {
    expect(prisonSlotMetadataSchema.safeParse({ ...freshSlotRecord(), usesDefaultName: true }).success).toBe(true);
    expect(prisonSlotMetadataSchema.safeParse({ ...freshSlotRecord(), usesDefaultName: 'Nowe więzienie' }).success).toBe(false);
  });

  it('accepts the same record with the pointer key absent rather than undefined', () => {
    const { currentGenerationId: _absent, ...withoutKey } = freshSlotRecord();
    expect(prisonSlotMetadataSchema.safeParse(withoutKey).success).toBe(true);
  });

  it('accepts a saved slot with a display name, a generation window and pending sync state', () => {
    const record = {
      ...freshSlotRecord(),
      displayName: 'A Block',
      currentGenerationId: 'gen-2',
      generationIds: ['gen-1', 'gen-2'],
      updatedAt: 2_000,
      pendingSync: { dirtySinceRevision: 3, markedAt: 2_000 },
    };
    expect(prisonSlotMetadataSchema.safeParse(record).success).toBe(true);
  });

  it('accepts updatedAt earlier than createdAt, because a system clock can go backwards between two saves', () => {
    // Deliberately *not* the save envelope's `updatedAt >= createdAt` rule: an
    // envelope's timestamps are written together, a slot's are independent
    // `Date.now()` readings, and a clock adjustment must not cost a prison.
    expect(prisonSlotMetadataSchema.safeParse({ ...freshSlotRecord(), createdAt: 5_000, updatedAt: 1 }).success).toBe(true);
  });

  it('accepts a pointer that is not in the retained window, which loadCurrent already recovers from', () => {
    const record = { ...freshSlotRecord(), currentGenerationId: 'gen-9', generationIds: ['gen-1'] };
    expect(prisonSlotMetadataSchema.safeParse(record).success).toBe(true);
  });

  it('accepts a slot record with currentRevision present (#1097)', () => {
    const record = { ...freshSlotRecord(), currentGenerationId: 'gen-1', generationIds: ['gen-1'], currentRevision: 4 };
    expect(prisonSlotMetadataSchema.safeParse(record).success).toBe(true);
  });

  /**
   * `currentRevision` was added by #1097, after this repository had already
   * written slots without it -- `freshSlotRecord()` predates the field and is
   * exactly that shape. It must keep parsing under the new schema, or every
   * existing player's save list would refuse to load the moment this schema
   * shipped (`docs/PERSISTENCE.md`, "Adding an optional field without a
   * version bump").
   */
  it('accepts a slot record from before currentRevision existed, with the key entirely absent', () => {
    const record = freshSlotRecord();
    expect('currentRevision' in record).toBe(false);
    const parsed = prisonSlotMetadataSchema.safeParse(record);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.currentRevision).toBeUndefined();
  });
});

describe('prisonSlotMetadataSchema: rejects records this repository could not have written', () => {
  const rejected: readonly (readonly [string, unknown])[] = [
    ['a non-object', 'prison-1'],
    ['null', null],
    ['a missing prisonId', { ...freshSlotRecord(), prisonId: undefined }],
    ['an empty prisonId', { ...freshSlotRecord(), prisonId: '' }],
    ['a missing gameVersion', (() => { const { gameVersion: _drop, ...rest } = freshSlotRecord(); return rest; })()],
    ['a string where the generation window belongs', { ...freshSlotRecord(), generationIds: 'gen-1' }],
    ['a non-string generation id', { ...freshSlotRecord(), generationIds: ['gen-1', 7] }],
    ['a timestamp that is not a number', { ...freshSlotRecord(), updatedAt: '1000' }],
    ['an unknown field', { ...freshSlotRecord(), slotIndex: 2 }],
    ['a half-written pendingSync', { ...freshSlotRecord(), pendingSync: { markedAt: 1 } }],
    ['a non-number currentRevision', { ...freshSlotRecord(), currentRevision: '4' }],
    ['a negative currentRevision', { ...freshSlotRecord(), currentRevision: -1 }],
  ];

  for (const [description, record] of rejected) {
    it(`rejects ${description}`, () => {
      expect(prisonSlotMetadataSchema.safeParse(record).success).toBe(false);
    });
  }
});

describe('decodePrisonSlotMetadata: absent is not the same as corrupt', () => {
  it('passes a missing slot through as undefined', () => {
    expect(decodePrisonSlotMetadata(undefined, 'prison-1')).toBeUndefined();
  });

  it('throws for a corrupt record, naming the prison and the failing field', () => {
    let thrown: unknown;
    try {
      decodePrisonSlotMetadata({ ...freshSlotRecord(), generationIds: 'gen-1' }, 'prison-1');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(CorruptSlotMetadataError);
    expect((thrown as CorruptSlotMetadataError).prisonId).toBe('prison-1');
    expect((thrown as CorruptSlotMetadataError).issues.join()).toContain('generationIds');
    expect((thrown as Error).message).toContain('left untouched');
  });

  it('decodes an old slot with no currentRevision at all, rather than refusing it (#1097)', () => {
    const legacy = { ...freshSlotRecord(), currentGenerationId: 'gen-1', generationIds: ['gen-1'] };
    expect('currentRevision' in legacy).toBe(false);
    const decoded = decodePrisonSlotMetadata(legacy, 'prison-1');
    expect(decoded).toBeDefined();
    expect(decoded?.currentRevision).toBeUndefined();
    expect(decoded?.currentGenerationId).toBe('gen-1');
  });

  it('refuses to write a record it could not read back', () => {
    // Without this gate, `create()` with an id the schema rejects would write
    // a slot that every later read refuses -- unreachable and undeletable.
    expect(() => encodePrisonSlotMetadata({ ...freshSlotRecord(), prisonId: '' } as unknown as PrisonSlotMetadata)).toThrow(
      CorruptSlotMetadataError,
    );
  });
});

describe('PrisonSaveRepository: a corrupt slot record is refused, never overwritten', () => {
  it('refuses list() rather than silently hiding the prison', async () => {
    const store = new MemoryLocalSaveStore();
    const repository = new PrisonSaveRepository(store);
    await repository.create({ prisonId: 'prison-good', gameVersion: 'lockstate-0.0.0' });
    await seedRawSlotRecord(store, { prisonId: 'prison-bad', gameVersion: 'lockstate-0.0.0' });

    await expect(repository.list()).rejects.toBeInstanceOf(CorruptSlotMetadataError);
  });

  it('refuses loadCurrent() instead of reporting the prison as missing', async () => {
    const store = new MemoryLocalSaveStore();
    const repository = new PrisonSaveRepository(store);
    await seedRawSlotRecord(store, { prisonId: 'prison-bad', generationIds: 'not-a-window' });

    await expect(repository.loadCurrent('prison-bad')).rejects.toBeInstanceOf(CorruptSlotMetadataError);
  });

  it('refuses create() for the same slot id, so a damaged record cannot be replaced by an empty one', async () => {
    const store = new MemoryLocalSaveStore();
    const repository = new PrisonSaveRepository(store);
    const corrupt = { prisonId: 'prison-bad', gameVersion: 'lockstate-0.0.0', generationIds: ['gen-1', 'gen-2'] };
    await seedRawSlotRecord(store, corrupt);

    await expect(repository.create({ prisonId: 'prison-bad', gameVersion: 'lockstate-0.0.0' })).rejects.toBeInstanceOf(
      CorruptSlotMetadataError,
    );
    // The record — and therefore the only reference to those two generations —
    // is still exactly as it was. This is the whole reason a corrupt slot is
    // refused rather than treated as absent.
    expect(await readRawSlotRecord(store, 'prison-bad')).toEqual(corrupt);
  });

  it('reports save() as a failed write and leaves the damaged record in place', async () => {
    const store = new MemoryLocalSaveStore();
    const repository = new PrisonSaveRepository(store);
    const corrupt = { prisonId: 'prison-bad', gameVersion: 'lockstate-0.0.0', generationIds: ['gen-1'] };
    await seedRawSlotRecord(store, corrupt);

    // `save()` already turns a throw from inside its transaction into a
    // `SaveWriteError`, so refusal lands in a path the UI already renders.
    const result = await repository.save('prison-bad', buildEnvelope('prison-bad'));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.message).toContain('unreadable');
    expect(await readRawSlotRecord(store, 'prison-bad')).toEqual(corrupt);
  });

  it('refuses delete() rather than orphaning the generations it can no longer enumerate', async () => {
    const store = new MemoryLocalSaveStore();
    const repository = new PrisonSaveRepository(store);
    await seedRawSlotRecord(store, { prisonId: 'prison-bad', generationIds: 'not-a-window' });

    await expect(repository.delete('prison-bad')).rejects.toBeInstanceOf(CorruptSlotMetadataError);
  });

  it('still reads and writes a valid slot end to end', async () => {
    const store = new MemoryLocalSaveStore();
    const repository = new PrisonSaveRepository(store);
    const created = await repository.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0', displayName: 'A Block' });

    expect(created.currentGenerationId).toBeUndefined();
    expect(await repository.list()).toEqual([created]);

    await repository.markPendingSync('prison-1', { dirtySinceRevision: 2, markedAt: 5_000 });
    expect((await repository.list())[0]?.pendingSync).toEqual({ dirtySinceRevision: 2, markedAt: 5_000 });
    await repository.clearPendingSync('prison-1');
    expect((await repository.list())[0]?.pendingSync).toBeUndefined();
  });
});
