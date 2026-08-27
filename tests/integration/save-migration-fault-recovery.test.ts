import { describe, expect, it, vi } from 'vitest';
import { PrisonSaveRepository } from '../../src/persistence/local/repository';
import { MemoryLocalSaveStore } from '../../src/persistence/local/memory-store';
import { computeSaveChecksum } from '../../src/persistence/checksum';
import { SAVE_SCHEMA_VERSION, decodeSaveEnvelope, type SaveEnvelope } from '../../src/persistence/save-schema';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { ConstructionSystem } from '../../src/simulation/construction/system';
import { chunkCoordinate } from '../../src/simulation/world/coordinates';
import v1InProgressFixture from '../fixtures/persistence/save-v1-in-progress.json';

/**
 * A migration step that throws must be a decode **verdict**, not an
 * exception -- and the reason is the recovery walk, not tidiness.
 *
 * `PrisonSaveRepository.loadCurrent` promises, in its own words, that "if it
 * is missing or fails schema/checksum validation, [it will] walk the
 * remaining generations newest-first and adopt the first one that validates".
 * `decodeSaveEnvelope` promises that "unknown or future versions, structural
 * corruption and checksum mismatches each fail with a distinct, actionable
 * error code", and `docs/PERSISTENCE.md`'s error taxonomy says the same.
 * `MigrationChain.migrate` used to call `step.migrate(currentValue)`
 * unwrapped, so a step that threw broke all three sentences at once: the
 * exception escaped `decodeSaveEnvelope`, aborted the `for` loop in
 * `loadCurrent`, and the older good generation was never reached.
 *
 * ### Why the fault is injected rather than provoked
 *
 * The reachable instance -- a V1 `entities.capacity` big enough that
 * `upgradeEntityLiveness`'s three typed arrays could not be allocated -- is
 * closed at the schema in the same change, which is the point of fixing the
 * instance as well as the class. So there is deliberately no input left that
 * makes a *real* step throw, and provoking one would mean re-opening the hole
 * this file exists to keep shut.
 *
 * What is faulted is therefore exactly one leaf: the V1 -> V2 transform
 * function. `decodeSaveEnvelope`, `MigrationChain`, `PrisonSaveRepository`
 * and the store are all the real thing, and the thrown value is the one that
 * was actually measured escaping this path (`RangeError: Array buffer
 * allocation failed`). The class is what is guarded: any step, present or
 * future, that throws for any reason.
 */
vi.mock('../../src/persistence/save-migrations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/persistence/save-migrations')>();
  return {
    ...actual,
    migrateSaveEnvelopeV1ToV2: () => {
      throw new RangeError('Array buffer allocation failed');
    },
  };
});

const PRISON_ID = 'prison-1';

/**
 * A distinguishable good save. `revision` drives the kernel tick and a terrain
 * run length, so the generation that survives the walk **identifies itself by
 * its own contents** rather than by a count or by being the only one left
 * (#375, and `docs/TESTING.md` defect shape 3: nothing here compares one
 * restored bundle against another).
 */
function goodEnvelope(revision: number): SaveEnvelope {
  const world = new SparseWorld(32);
  world.setOwned({ x: chunkCoordinate(revision), y: chunkCoordinate(revision + 1) }, true);
  const construction = new ConstructionSystem(world);
  const kernel = new Kernel(100 * revision, 0);
  const payload = {
    kernel: kernel.snapshot(),
    world: world.snapshot(),
    construction: construction.snapshot(),
  };
  return {
    saveSchemaVersion: SAVE_SCHEMA_VERSION,
    gameVersion: 'lockstate-0.0.0',
    prisonId: PRISON_ID,
    revision,
    createdAt: 1,
    updatedAt: revision,
    checksum: computeSaveChecksum(payload as never),
    payload,
  } as unknown as SaveEnvelope;
}

function idSequence(prefix: string): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}-${n}`;
  };
}

describe('a migration step that throws is a verdict, and the recovery walk survives it', () => {
  it('reports the throw as a decode error code instead of escaping decodeSaveEnvelope', () => {
    let result: ReturnType<typeof decodeSaveEnvelope>;
    expect(() => {
      result = decodeSaveEnvelope(v1InProgressFixture);
    }).not.toThrow();

    expect(result!).toMatchObject({ ok: false, error: { code: 'migration-step-threw', atVersion: 1 } });
    if (result!.ok) return;
    expect(result!.error.message).toContain('RangeError: Array buffer allocation failed');
  });

  it('walks past the generation whose migration threw and adopts the older good one, with its own contents', async () => {
    const store = new MemoryLocalSaveStore();
    const repo = new PrisonSaveRepository(store, { generateGenerationId: idSequence('gen') });
    await repo.create({ prisonId: PRISON_ID, gameVersion: 'lockstate-0.0.0' });
    await repo.save(PRISON_ID, goodEnvelope(1)); // gen-1: good, and the one that must survive
    await repo.save(PRISON_ID, goodEnvelope(2)); // gen-2: overwritten below

    // A V1 save lands in the newest slot, below repository validation --
    // exactly how a save written by an older build, or an import, arrives.
    await store.runTransaction('readwrite', async (tx) => {
      await tx.putGeneration(PRISON_ID, 'gen-2', JSON.parse(JSON.stringify(v1InProgressFixture)) as unknown);
    });

    const result = await repo.loadCurrent(PRISON_ID);

    expect(result).toMatchObject({ ok: true, generationId: 'gen-1', outcome: 'recovered-previous' });
    if (!result.ok) return;

    // gen-1's own bytes, written out here rather than read back off anything
    // this call produced: revision 1's kernel tick and its owned chunk.
    expect(result.envelope.revision).toBe(1);
    expect(result.envelope.payload.kernel.tick).toBe(100);
    expect(result.envelope.payload.world.ownedChunks).toEqual([{ x: 1, y: 2 }]);

    // And the pointer is healed, so the throwing generation is not re-walked.
    const [metadata] = await repo.list();
    expect(metadata).toMatchObject({ currentGenerationId: 'gen-1', generationIds: ['gen-1'] });
  });

  it('refuses an import whose migration throws, with a code, rather than throwing at the player', async () => {
    const repo = new PrisonSaveRepository(new MemoryLocalSaveStore(), { generateGenerationId: idSequence('imported') });
    await repo.create({ prisonId: PRISON_ID, gameVersion: 'lockstate-0.0.0' });

    const result = await repo.importSave(PRISON_ID, v1InProgressFixture);

    expect(result).toMatchObject({ ok: false, rejected: { code: 'migration-step-threw', atVersion: 1 } });
  });
});
