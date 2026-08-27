import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { MemoryLocalSaveStore } from '../../src/persistence/local/memory-store';
import { PrisonSaveRepository } from '../../src/persistence/local/repository';
import { decodeSaveEnvelope, SAVE_SCHEMA_VERSION } from '../../src/persistence/save-schema';
import { InProcessSessionHost } from '../../src/persistence/session/runtime-host';
import { SessionController } from '../../src/persistence/session/session-controller';
import { restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';

/**
 * The seed a session was played at, through the save (issue #412, ADR 0038 §4).
 *
 * ### What was wrong, and why nothing noticed
 *
 * `masterSeed` was absent from the payload entirely, so both production
 * restores took `restoreSimulationRuntime`'s `= 0` default and the seed a
 * session was created with was unrecoverable after a load. It was **inert**:
 * the seed's only job was deriving the four initial RNG stream states, and
 * `Kernel.restoreState` replaced all four with the snapshot's, so a restored
 * session behaved identically whatever seed it was handed. Every restore test
 * passed an explicit seed and production passed none, which is precisely why a
 * 2,600-test suite could not see it.
 *
 * It stopped being inert with #415. A stream the bundle omits is now
 * **re-seeded** from `deriveXoshiroState(masterSeed, name)` rather than
 * discarded, so the seed is the only input that stream has.
 * `tests/determinism/save-rng-stream-compatibility.test.ts` holds that half.
 * This file holds the plumbing: that a real save writes the seed, that a real
 * load reads it, and that neither of them asks the host what seed it prefers.
 *
 * ### Why the seed is never read back out of the object it was written into
 *
 * `docs/TESTING.md`, and #412's own Required Verification: *"the test must not
 * pass the seed in and read the same value back out of the same object"*.
 * Every case below states the seed as a literal, hands it to a
 * `SessionController` as an option, and then reads it from a **decoded save**
 * -- a plain JSON value re-validated and checksum-verified by
 * `decodeSaveEnvelope` as a save of unknown provenance, which is what the
 * repository does with a generation it reads back from storage.
 */

/** Stated as literals. Neither is `0`, so a payload that quietly defaulted would fail rather than agree. */
const CREATED_AT_SEED = 4242;
const A_DIFFERENT_SEED_THE_LOADING_HOST_PREFERS = 7;

const PRISON_ID = 'seeded-prison';

const V1_FRESH_PRISON_FIXTURE = new URL('../fixtures/persistence/save-v1-fresh-prison.json', import.meta.url);

interface Fixture {
  readonly controller: SessionController;
  readonly repository: PrisonSaveRepository;
}

/** A real controller over a real repository and a real host, sharing one store so a second controller can load what the first wrote. */
function buildFixture(store: MemoryLocalSaveStore, masterSeed: number): Fixture {
  const repository = new PrisonSaveRepository(store);
  const controller = new SessionController(repository, new InProcessSessionHost(), { gameVersion: 'test-version', masterSeed });
  return { controller, repository };
}

/** The save the repository would hand a later load: decoded, migrated if need be, checksum-verified. */
async function decodedCurrentPayload(repository: PrisonSaveRepository): Promise<Record<string, unknown>> {
  const loaded = await repository.loadCurrent(PRISON_ID);
  if (!loaded.ok) throw new Error(`the prison did not load: ${loaded.reason}`);
  expect(loaded.envelope.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
  return loaded.envelope.payload as unknown as Record<string, unknown>;
}

describe('the master seed a session was played at', () => {
  it('is written into the save a new prison produces', async () => {
    const store = new MemoryLocalSaveStore();
    const { controller, repository } = buildFixture(store, CREATED_AT_SEED);

    const created = await controller.createPrison(PRISON_ID);
    expect(created.ok).toBe(true);

    expect(await decodedCurrentPayload(repository)).toMatchObject({ masterSeed: CREATED_AT_SEED });
  });

  it('survives a load and a re-save, and is not replaced by the loading host preference', async () => {
    // The distinction that makes this worth a case: a `SessionController` has a
    // `masterSeed` option of its own, and it is the seed a *new* prison is
    // created with. A session loaded from a save was seeded by whoever created
    // it, so writing the controller's option into that save would relabel
    // somebody else's run.
    const store = new MemoryLocalSaveStore();
    const author = buildFixture(store, CREATED_AT_SEED);
    expect((await author.controller.createPrison(PRISON_ID)).ok).toBe(true);

    const reader = buildFixture(store, A_DIFFERENT_SEED_THE_LOADING_HOST_PREFERS);
    const loaded = await reader.controller.loadPrison(PRISON_ID);
    expect(loaded.ok).toBe(true);

    reader.controller.markDirty();
    expect((await reader.controller.saveNow()).ok).toBe(true);

    expect(await decodedCurrentPayload(reader.repository)).toMatchObject({ masterSeed: CREATED_AT_SEED });
  });

  it('is what a restored runtime reports, so no production restore takes the `= 0` default', async () => {
    const store = new MemoryLocalSaveStore();
    const { controller, repository } = buildFixture(store, CREATED_AT_SEED);
    expect((await controller.createPrison(PRISON_ID)).ok).toBe(true);

    // Restored with **no** seed argument, which is what both production restore
    // paths do (`state-machine.ts` and `runtime-host.ts` each call
    // `restoreSimulationRuntime(bundle)`).
    const payload = await decodedCurrentPayload(repository);
    const { runtime } = restoreSimulationRuntime(payload as unknown as SessionSnapshotBundle);
    expect(runtime.masterSeed).toBe(CREATED_AT_SEED);
  });

  it('is absent from a save written before the field existed, and that means zero', async () => {
    // The forward-compatibility half, on a real V1 fixture rather than a
    // hand-stripped payload: it decodes, it migrates through four steps to V5,
    // and no step fabricates a seed -- there is nothing to fabricate one from.
    const decoded = decodeSaveEnvelope(JSON.parse(readFileSync(V1_FRESH_PRISON_FIXTURE, 'utf8')));
    if (!decoded.ok) throw new Error(`the fixture no longer decodes: ${decoded.error.code}`);
    expect(decoded.migrated).toBe(true);
    expect(decoded.value.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(Object.keys(decoded.value.payload)).not.toContain('masterSeed');

    const { runtime } = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle);
    // Not "unknown", and not the caller's choice: 0, because production has
    // never supplied another value, so every save written before this field
    // existed was written by a session seeded at 0.
    expect(runtime.masterSeed).toBe(0);
  });
});
