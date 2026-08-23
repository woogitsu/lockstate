import type { SaveEnvelopeV1 } from '../save-schema';
import type { CloudPrisonState, CloudSaveClient, CloudSaveVersionSummary, UploadOutcome } from './client';

interface StoredVersion extends CloudSaveVersionSummary {
  readonly payload: unknown;
}

interface StoredPrison {
  gameVersion: string;
  slotIndex: number;
  currentVersion: CloudSaveVersionSummary | undefined;
  versions: StoredVersion[]; // by revision, ascending
}

let versionSequence = 0;

/**
 * In-memory stand-in for the Supabase `create_save_version` RPC
 * (supabase/migrations/20260822190300_create_save_version_rpc.sql):
 * same conflict/idempotency-by-checksum semantics, no auth/RLS (this
 * layer is already scoped to "my own" calls by the time client code
 * reaches it — RLS is tested at the SQL layer, see supabase/tests/).
 * Used to unit-test `PrisonSyncEngine` without a real Supabase project.
 */
export class MemoryCloudSaveClient implements CloudSaveClient {
  private readonly prisons = new Map<string, StoredPrison>();

  public async getPrisonState(prisonId: string): Promise<CloudPrisonState | undefined> {
    const prison = this.prisons.get(prisonId);
    return prison === undefined ? undefined : { prisonId, currentVersion: prison.currentVersion };
  }

  public async registerPrison(prisonId: string, gameVersion: string, slotIndex: number): Promise<void> {
    if (this.prisons.has(prisonId)) throw new Error(`Prison "${prisonId}" is already registered.`);
    this.prisons.set(prisonId, { gameVersion, slotIndex, currentVersion: undefined, versions: [] });
  }

  public async uploadVersion(prisonId: string, newRevision: number, envelope: SaveEnvelopeV1): Promise<UploadOutcome> {
    const prison = this.prisons.get(prisonId);
    if (prison === undefined) return { status: 'not-registered' };

    const existing = prison.versions.find((version) => version.checksum === envelope.checksum);
    if (existing !== undefined) {
      return { status: 'idempotent-replay', version: { versionId: existing.versionId, revision: existing.revision, checksum: existing.checksum } };
    }

    const currentRevision = prison.currentVersion?.revision ?? 0;
    if (newRevision !== currentRevision + 1) {
      return { status: 'conflict', cloudCurrent: prison.currentVersion };
    }

    versionSequence += 1;
    const version: StoredVersion = { versionId: `cloud-gen-${versionSequence}`, revision: newRevision, checksum: envelope.checksum, payload: envelope };
    prison.versions.push(version);
    prison.currentVersion = { versionId: version.versionId, revision: version.revision, checksum: version.checksum };

    return { status: 'created', version: prison.currentVersion };
  }

  public async downloadVersion(prisonId: string, versionId: string): Promise<unknown | undefined> {
    return this.prisons.get(prisonId)?.versions.find((version) => version.versionId === versionId)?.payload;
  }
}
