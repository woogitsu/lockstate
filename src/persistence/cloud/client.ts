import type { SaveEnvelopeV1 } from '../save-schema';

export interface CloudSaveVersionSummary {
  readonly versionId: string;
  readonly revision: number;
  readonly checksum: string;
}

export interface CloudPrisonState {
  readonly prisonId: string;
  /** `undefined` when the prison is registered in the cloud but has no accepted version yet. */
  readonly currentVersion: CloudSaveVersionSummary | undefined;
}

export type UploadOutcome =
  | { readonly status: 'created'; readonly version: CloudSaveVersionSummary }
  /** This exact revision already holds this exact content — the caller's own attempt committed. `version.revision` always equals the requested `newRevision`, so a replay can never report a revision the caller did not ask for. */
  | { readonly status: 'idempotent-replay'; readonly version: CloudSaveVersionSummary }
  | { readonly status: 'conflict'; readonly cloudCurrent: CloudSaveVersionSummary | undefined }
  | { readonly status: 'not-registered' }
  | { readonly status: 'error'; readonly message: string };

/**
 * Storage-agnostic cloud boundary, mirroring `LocalSaveStore`
 * (`../local/store.ts`): all sync/conflict policy lives in
 * `PrisonSyncEngine` against this interface, so it is fully unit-testable
 * with `MemoryCloudSaveClient` independent of a real Supabase project.
 * `SupabaseCloudSaveClient` is the real, untested-here adapter.
 */
export interface CloudSaveClient {
  getPrisonState(prisonId: string): Promise<CloudPrisonState | undefined>;
  registerPrison(prisonId: string, gameVersion: string, slotIndex: number): Promise<void>;
  /** `newRevision` must be the envelope's own `revision` (see save-schema.ts): the server enforces it is exactly `current + 1`. */
  uploadVersion(prisonId: string, newRevision: number, envelope: SaveEnvelopeV1): Promise<UploadOutcome>;
  /** Raw payload; the caller validates it through `decodeSaveEnvelope` (#18) before trusting it. */
  downloadVersion(prisonId: string, versionId: string): Promise<unknown | undefined>;
}
