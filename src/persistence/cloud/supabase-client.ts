import type { SupabaseClient } from '@supabase/supabase-js';
import type { SaveEnvelope } from '../save-schema';
import type {
  CloudPrisonState,
  CloudSaveClient,
  CloudSaveVersionSummary,
  RegisterPrisonOutcome,
  UploadOutcome,
} from './client';

interface CreatePrisonRow {
  readonly status: 'created' | 'at_slot_limit' | 'slot_taken';
  readonly prison_id: string | null;
  readonly slot_index: number | null;
  readonly used_slots: number | null;
  readonly capacity: number | null;
}

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
 * Mostly not unit-tested here: unlike IndexedDB (#19, faked with
 * `fake-indexeddb`), Postgres RLS and this RPC's `SECURITY DEFINER` /
 * row-locking behavior are not meaningfully fakeable in pure JS — a fake
 * would test the fake, not this contract. `supabase/tests/` covers the
 * DB-side contract this adapter depends on, and it *is* executed: `pnpm
 * verify:sql` runs every suite against a plain PostgreSQL server with
 * pgTAP — no Docker, no Supabase CLI — and CI runs it as a required step.
 * That is the whole reason the check is shaped that way, per
 * `docs/TESTING.md`: it has to keep working where container images cannot
 * be pulled. Review this class by inspection against that SQL.
 *
 * Two things a pure-JS fake *can* prove, because both are properties of the
 * code in this file rather than of the database, and
 * `tests/unit/persistence-cloud-supabase-client.test.ts` pins both. Which
 * rows this class asks for: it drives the class through a filter-applying
 * PostgREST stand-in and pins that both save-version reads are scoped to
 * their prison (#105 finding 13). And which outcome each RPC status maps
 * to, for `create_prison` and `create_save_version` alike, including that
 * no two statuses collapse onto the same outcome -- `rpc-status-vocabulary-
 * contract.test.ts` checks the row type's declared vocabulary, so a
 * *missing* case is a type error while a *wrong* case was caught by nothing
 * (#264 S7). Neither test says anything about RLS, grants or the RPC's
 * semantics.
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

    // Scoped to `prison_id` as well as `id`, exactly as `downloadVersion`
    // below already is. This is defence in depth against a same-owner id
    // mix-up -- a stale or swapped `current_version_id` pointing at another
    // of this owner's prisons -- not a confidentiality fix: `save_versions`
    // is RLS-protected through `prisons.owner_id`, and #105 demonstrated by
    // execution that no cross-tenant read exists on this table for either
    // client role. What it changes is that such a pointer now fails loudly
    // (`.single()` finds no row) instead of quietly reporting another
    // prison's revision and checksum as this prison's cloud state, which
    // `PrisonSyncEngine` would then use to sequence pushes.
    const { data: version, error: versionError } = await this.supabase
      .from('save_versions')
      .select('id, revision, checksum')
      .eq('prison_id', prisonId)
      .eq('id', prison.current_version_id)
      .single();
    if (versionError !== null) throw new Error(`Failed to load the current save version: ${versionError.message}`);

    return {
      prisonId,
      currentVersion: { versionId: version.id, revision: version.revision, checksum: version.checksum },
    };
  }

  /**
   * Registers a cloud prison through `create_prison()`.
   *
   * This was a direct `.insert({ id, game_version, slot_index })` into
   * `prisons`, and it could **never succeed**. `owner_id` is `not null` with no
   * default, and the insert policy is `auth.uid() = owner_id` -- so executed
   * against the real schema it raises `new row violates row-level security
   * policy for table "prisons"`, because RLS refuses the row before the NOT
   * NULL check runs and `auth.uid() = NULL` is NULL rather than true (#192). It
   * failed for every caller, on every project, and the error named the policy
   * rather than the missing column.
   *
   * Nothing caught it because nothing called it, and no test could have:
   * `MemoryCloudSaveClient` stores into a `Map` and needs no `owner_id`, so the
   * double succeeded on exactly the arguments the real client failed on, and
   * every `PrisonSyncEngine` test drives the double.
   *
   * `create_prison()` is the fix rather than adding `owner_id` to the insert,
   * for two properties #105 verified and the insert cannot have: the owner is
   * `auth.uid()` and nothing else -- there is no forgeable owner parameter --
   * and it fails closed with `42501 an authenticated identity is required`. It
   * is also what `20260822190100_create_prisons.sql` calls "the front door that
   * answers with a discriminated status instead of an exception".
   *
   * The free-tier slot cap fires on both paths either way: ADR 0013 put it on a
   * trigger precisely so it does not depend on one blessed door, and
   * `supabase/tests/004_free_tier_capacity.test.sql` drives that refusal through
   * the client's own INSERT grant. What the RPC adds is that the cap arrives as
   * a status carrying `used`/`capacity` rather than as an `LS001` exception.
   */
  public async registerPrison(
    prisonId: string,
    gameVersion: string,
    slotIndex: number,
  ): Promise<RegisterPrisonOutcome> {
    const { data, error } = await this.supabase.rpc('create_prison', {
      p_prison_id: prisonId,
      p_game_version: gameVersion,
      p_slot_index: slotIndex,
    });
    if (error !== null) return { status: 'error', message: error.message };

    const row = (Array.isArray(data) ? data[0] : data) as CreatePrisonRow | undefined;
    if (row === undefined) return { status: 'error', message: 'create_prison returned no row.' };

    switch (row.status) {
      case 'created':
        // `slot_index` is the slot the server actually used, which is the value
        // worth reporting rather than the one that was asked for.
        return { status: 'created', slotIndex: row.slot_index ?? slotIndex };
      case 'at_slot_limit':
        return { status: 'at-slot-limit', used: row.used_slots ?? 0, capacity: row.capacity ?? 0 };
      case 'slot_taken':
        return { status: 'slot-taken', slotIndex: row.slot_index ?? slotIndex };
    }
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
