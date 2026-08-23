import { describe, expect, it } from 'vitest';
import { PrisonSyncEngine, resolveSyncConflict } from '../../src/persistence/cloud/sync-engine';
import { MemoryCloudSaveClient } from '../../src/persistence/cloud/memory-client';
import { createSaveEnvelope, type SaveEnvelopeV1 } from '../../src/persistence/save-schema';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { ConstructionSystem } from '../../src/simulation/construction/system';
import { chunkCoordinate } from '../../src/simulation/world/coordinates';

function buildEnvelope(revision: number): SaveEnvelopeV1 {
  const world = new SparseWorld(32);
  world.setOwned({ x: chunkCoordinate(0), y: chunkCoordinate(0) }, true);
  const construction = new ConstructionSystem(world);
  const kernel = new Kernel(revision, 0);
  return createSaveEnvelope({
    gameVersion: 'lockstate-0.0.0',
    prisonId: 'prison-1',
    revision,
    createdAt: 0,
    updatedAt: revision,
    kernel: kernel.snapshot(),
    world: world.snapshot(),
    construction: construction.snapshot(),
  });
}

describe('PrisonSyncEngine: push', () => {
  it('reports not-registered when the prison does not exist in the cloud yet', async () => {
    const engine = new PrisonSyncEngine(new MemoryCloudSaveClient());
    const result = await engine.push('prison-1', buildEnvelope(1));
    expect(result).toMatchObject({ ok: false, reason: 'not-registered' });
  });

  it('uploads the first version once the prison is registered', async () => {
    const client = new MemoryCloudSaveClient();
    await client.registerPrison('prison-1', 'lockstate-0.0.0', 0);
    const engine = new PrisonSyncEngine(client);

    const result = await engine.push('prison-1', buildEnvelope(1));
    expect(result).toEqual({ ok: true, outcome: 'uploaded', revision: 1 });
  });

  it('treats resubmitting the same accepted content at the same revision as already-synced, not an error or a conflict', async () => {
    const client = new MemoryCloudSaveClient();
    await client.registerPrison('prison-1', 'lockstate-0.0.0', 0);
    const engine = new PrisonSyncEngine(client);

    await engine.push('prison-1', buildEnvelope(1));
    const replay = await engine.push('prison-1', buildEnvelope(1));
    expect(replay).toEqual({ ok: true, outcome: 'already-synced', revision: 1 });
  });

  it('treats content that recurs at a later revision as a new revision, not a replay of the earlier one', async () => {
    const client = new MemoryCloudSaveClient();
    await client.registerPrison('prison-1', 'lockstate-0.0.0', 0);
    const engine = new PrisonSyncEngine(client);

    const revisionOne = buildEnvelope(1);
    await engine.push('prison-1', revisionOne);

    // The player undoes their change, so revision 2's content is byte-identical
    // to revision 1's. Keying idempotency on the checksum alone answered this
    // with a replay of revision 1: the cloud pointer never advanced while the
    // client recorded itself as synced, and its next push conflicted for no
    // reason. A revert is a new revision, not a retry of an old one.
    const revertedToRevisionOne = { ...buildEnvelope(2), checksum: revisionOne.checksum } as SaveEnvelopeV1;
    expect(await engine.push('prison-1', revertedToRevisionOne)).toEqual({
      ok: true,
      outcome: 'uploaded',
      revision: 2,
    });

    // The pointer really advanced, so the next correctly-sequenced push is
    // accepted rather than reported as a spurious conflict.
    const revisionThree = { ...buildEnvelope(3), checksum: 'checksum-rev-3' } as SaveEnvelopeV1;
    expect(await engine.push('prison-1', revisionThree)).toEqual({ ok: true, outcome: 'uploaded', revision: 3 });
  });

  it('never silently overwrites: a stale push is reported as an explicit conflict', async () => {
    const client = new MemoryCloudSaveClient();
    await client.registerPrison('prison-1', 'lockstate-0.0.0', 0);
    const engine = new PrisonSyncEngine(client);

    await engine.push('prison-1', buildEnvelope(1));
    await engine.push('prison-1', buildEnvelope(2));

    // A third device that only ever saw revision 1 built its own, different revision 2.
    const divergentRevisionTwo = { ...buildEnvelope(2), checksum: 'third-device-checksum' } as SaveEnvelopeV1;
    const staleResult = await engine.push('prison-1', divergentRevisionTwo);
    expect(staleResult).toMatchObject({ ok: false, reason: 'conflict', cloudCurrent: { revision: 2 } });
  });
});

describe('PrisonSyncEngine: two-client concurrency', () => {
  it('produces exactly one success and one explicit conflict for concurrent N -> N+1 pushes', async () => {
    const client = new MemoryCloudSaveClient();
    await client.registerPrison('prison-1', 'lockstate-0.0.0', 0);
    const engine = new PrisonSyncEngine(client);

    await engine.push('prison-1', buildEnvelope(1)); // both devices start from revision 1

    const deviceA = engine.push('prison-1', { ...buildEnvelope(2), checksum: 'device-a-checksum' } as SaveEnvelopeV1);
    const deviceB = engine.push('prison-1', { ...buildEnvelope(2), checksum: 'device-b-checksum' } as SaveEnvelopeV1);
    const [resultA, resultB] = await Promise.all([deviceA, deviceB]);

    const results = [resultA, resultB];
    const successes = results.filter((r) => r.ok);
    const conflicts = results.filter((r) => !r.ok && r.reason === 'conflict');
    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
  });

  it('lets the conflicting device retry idempotently and succeed after resolving', async () => {
    const client = new MemoryCloudSaveClient();
    await client.registerPrison('prison-1', 'lockstate-0.0.0', 0);
    const engine = new PrisonSyncEngine(client);
    await engine.push('prison-1', buildEnvelope(1));

    await engine.push('prison-1', { ...buildEnvelope(2), checksum: 'device-a-checksum' } as SaveEnvelopeV1);
    const conflict = await engine.push('prison-1', { ...buildEnvelope(2), checksum: 'device-b-checksum' } as SaveEnvelopeV1);
    expect(conflict).toMatchObject({ ok: false, reason: 'conflict' });

    const action = conflict.ok ? undefined : resolveSyncConflict('keep-local', conflict.reason === 'conflict' ? conflict.cloudCurrent : undefined);
    expect(action).toEqual({ kind: 'retry-push', newRevision: 3 });

    const retried = await engine.push('prison-1', { ...buildEnvelope(3), checksum: 'device-b-checksum-retry' } as SaveEnvelopeV1);
    expect(retried).toEqual({ ok: true, outcome: 'uploaded', revision: 3 });
  });
});

describe('PrisonSyncEngine: pull', () => {
  it('reports no-cloud-version for a registered prison with nothing uploaded yet', async () => {
    const client = new MemoryCloudSaveClient();
    await client.registerPrison('prison-1', 'lockstate-0.0.0', 0);
    const engine = new PrisonSyncEngine(client);

    expect(await engine.pull('prison-1')).toEqual({ ok: false, reason: 'no-cloud-version' });
  });

  it('downloads and validates the current version through #18 decoding', async () => {
    const client = new MemoryCloudSaveClient();
    await client.registerPrison('prison-1', 'lockstate-0.0.0', 0);
    const engine = new PrisonSyncEngine(client);
    const envelope = buildEnvelope(1);
    await engine.push('prison-1', envelope);

    const pulled = await engine.pull('prison-1');
    expect(pulled).toEqual({ ok: true, envelope });
  });
});

describe('resolveSyncConflict', () => {
  it('maps keep-local to a retry-push at cloudCurrent.revision + 1', () => {
    expect(resolveSyncConflict('keep-local', { versionId: 'v1', revision: 4, checksum: 'x' })).toEqual({
      kind: 'retry-push',
      newRevision: 5,
    });
  });

  it('maps keep-local with no cloud version yet to revision 1', () => {
    expect(resolveSyncConflict('keep-local', undefined)).toEqual({ kind: 'retry-push', newRevision: 1 });
  });

  it('maps keep-cloud, duplicate and cancel to their respective actions', () => {
    const cloudCurrent = { versionId: 'v1', revision: 1, checksum: 'x' };
    expect(resolveSyncConflict('keep-cloud', cloudCurrent)).toEqual({ kind: 'pull-and-adopt' });
    expect(resolveSyncConflict('duplicate', cloudCurrent)).toEqual({ kind: 'duplicate-as-new-prison' });
    expect(resolveSyncConflict('cancel', cloudCurrent)).toEqual({ kind: 'cancel' });
  });
});
