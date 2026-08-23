import type { SupabaseClient } from '@supabase/supabase-js';
import type { SaveEnvelope } from '../save-schema';
import type { CloudPrisonState, CloudSaveClient, CloudSaveVersionSummary, UploadOutcome } from './client';

interface CreateSaveVersionRow {
  readonly status: 'created' | 'conflict' | 'idempotent_replay';
  readonly version_id: string | null;
  readonly revision: number | null;
  readonly checksum: string | null;
}

/**
 * Thin real adapter over `@supabase/supabase-js`, calling the
 * `create_save_version` RPC (supabase/migrations/
 * 20260822190300_create_save_version_rpc.sql) and the `prisons`/
 * `save_versions` tables it protects. Deliberately minimal: all conflict/
 * idempotency policy lives in `PrisonSyncEngine`; this class only
 * translates between its `CloudSaveClient` contract and PostgREST/RPC
 * calls.
 *
 * Not unit-tested here: unlike IndexedDB (#19, faked with
 * `fake-indexeddb`), Postgres RLS and this RPC's `SECURITY DEFINER` /
 * row-locking behavior are not meaningfully fakeable in pure JS — a fake
 * would test the fake, not this contract. `supabase/tests/` covers the
 * DB-side contract this adapter depends on (unexecuted here; needs a
 * local Supabase/Docker stack — see docs/CLOUD_SAVE.md). Review this
 * class by inspection against that SQL.
 */
export class SupabaseCloudSaveClient implements CloudSaveClient {
  public constructor(private readonly supabase: SupabaseClient) {}

  public async getPrisonState(prisonId: string): Promise<CloudPrisonState | undefined> {
    const { data: prison, error } = await this.supabase
      .from('prisons')
      .select('id, current_version_id')
      .eq('id', prisonId)
      .maybeSingle();
    if (error !== null) throw new Error(`Failed to load cloud prison state: ${error.message}`);
    if (prison === null) return undefined;
    if (prison.current_version_id === null) return { prisonId, currentVersion: undefined };

    const { data: version, error: versionError } = await this.supabase
      .from('save_versions')
      .select('id, revision, checksum')
      .eq('id', prison.current_version_id)
      .single();
    if (versionError !== null) throw new Error(`Failed to load the current save version: ${versionError.message}`);

    return {
      prisonId,
      currentVersion: { versionId: version.id, revision: version.revision, checksum: version.checksum },
    };
  }

  public async registerPrison(prisonId: string, gameVersion: string, slotIndex: number): Promise<void> {
    const { error } = await this.supabase
      .from('prisons')
      .insert({ id: prisonId, game_version: gameVersion, slot_index: slotIndex });
    if (error !== null) throw new Error(`Failed to register the cloud prison: ${error.message}`);
  }

  public async uploadVersion(prisonId: string, newRevision: number, envelope: SaveEnvelope): Promise<UploadOutcome> {
    const byteSize = new TextEncoder().encode(JSON.stringify(envelope.payload)).length;
    const { data, error } = await this.supabase.rpc('create_save_version', {
      p_prison_id: prisonId,
      p_new_revision: newRevision,
      p_save_schema_version: envelope.saveSchemaVersion,
      p_checksum: envelope.checksum,
      p_payload: envelope.payload,
      p_storage_path: null,
      p_byte_size: byteSize,
    });
    if (error !== null) {
      // PostgREST/Postgres do not have a standard way to distinguish "row not found"
      // from other RPC failures in the error object alone; treat every RPC error as
      // generic here and let the caller decide whether to register the prison and retry.
      return { status: 'error', message: error.message };
    }

    const row = (Array.isArray(data) ? data[0] : data) as CreateSaveVersionRow | undefined;
    if (row === undefined || row.version_id === null || row.revision === null || row.checksum === null) {
      return { status: 'error', message: 'create_save_version returned no row.' };
    }

    const version: CloudSaveVersionSummary = { versionId: row.version_id, revision: row.revision, checksum: row.checksum };
    switch (row.status) {
      case 'created':
        return { status: 'created', version };
      case 'idempotent_replay':
        return { status: 'idempotent-replay', version };
      case 'conflict':
        return { status: 'conflict', cloudCurrent: row.revision > 0 ? version : undefined };
    }
  }

  public async downloadVersion(prisonId: string, versionId: string): Promise<unknown | undefined> {
    const { data: version, error } = await this.supabase
      .from('save_versions')
      .select('revision, save_schema_version, checksum, payload, storage_path, created_at')
      .eq('prison_id', prisonId)
      .eq('id', versionId)
      .maybeSingle();
    if (error !== null) throw new Error(`Failed to download the save version: ${error.message}`);
    if (version === null) return undefined;
    if (version.storage_path !== null) {
      throw new Error(
        'Supabase Storage-backed payloads are not implemented yet: the JSONB-vs-Storage threshold is still a candidate pending benchmark evidence (docs/CLOUD_SAVE.md).',
      );
    }

    const { data: prison, error: prisonError } = await this.supabase
      .from('prisons')
      .select('game_version')
      .eq('id', prisonId)
      .single();
    if (prisonError !== null) throw new Error(`Failed to load prison metadata: ${prisonError.message}`);

    const createdAtMs = Date.parse(version.created_at);
    return {
      saveSchemaVersion: version.save_schema_version,
      gameVersion: prison.game_version,
      prisonId,
      revision: version.revision,
      createdAt: createdAtMs,
      updatedAt: createdAtMs,
      checksum: version.checksum,
      payload: version.payload,
    };
  }
}
