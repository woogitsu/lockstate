import type { SaveEnvelope } from '../save-schema';

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
 * What registering a cloud prison can answer.
 *
 * `registerPrison` returned `Promise<void>` and could **never succeed**: it
 * inserted `{id, game_version, slot_index}` directly into `prisons`, and
 * `owner_id` is `not null` with no default while the insert policy is
 * `auth.uid() = owner_id`. Executed against the real schema, that raises
 * `new row violates row-level security policy for table "prisons"` -- RLS
 * refuses it before the NOT NULL check ever runs, because `auth.uid() = NULL`
 * is NULL rather than true, so the error even names the wrong thing (#192).
 *
 * It now goes through `create_prison()`, which ADR 0013 and
 * `20260822190100_create_prisons.sql` describe as "the front door that answers
 * with a discriminated status instead of an exception": the owner is
 * `auth.uid()` and nothing else -- there is no forgeable owner parameter -- and
 * it fails closed with `42501 an authenticated identity is required`.
 *
 * The return type widened from `void` for one reason: **`at-slot-limit` is a
 * thing a player has to be told.** `docs/TRUSTED_SERVICES.md` commits to
 * read-only degradation rather than an opaque failure at the free-tier cap, and
 * throwing on a non-`created` status would have kept the old signature while
 * losing exactly the information ADR 0013 built the status to carry. `used` and
 * `capacity` come back with it so a caller can say "5 of 5" rather than "no".
 */
export type RegisterPrisonOutcome =
  | { readonly status: 'created'; readonly slotIndex: number }
  /** The account is at its save-slot cap. Every existing prison stays listable, loadable and saveable; only another slot is refused. */
  | { readonly status: 'at-slot-limit'; readonly used: number; readonly capacity: number }
  /** Another prison already occupies this slot index for this account. */
  | { readonly status: 'slot-taken'; readonly slotIndex: number }
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
  registerPrison(prisonId: string, gameVersion: string, slotIndex: number): Promise<RegisterPrisonOutcome>;
  /** `newRevision` must be the envelope's own `revision` (see save-schema.ts): the server enforces it is exactly `current + 1`. */
  uploadVersion(prisonId: string, newRevision: number, envelope: SaveEnvelope): Promise<UploadOutcome>;
  /** Raw payload; the caller validates it through `decodeSaveEnvelope` (#18) before trusting it. */
  downloadVersion(prisonId: string, versionId: string): Promise<unknown | undefined>;
}
