import { decodeSaveEnvelope, type SaveDecodeError, type SaveEnvelope } from '../save-schema';
import type { CloudSaveClient, CloudSaveVersionSummary } from './client';

export type PushResult =
  | { readonly ok: true; readonly outcome: 'uploaded' | 'already-synced'; readonly revision: number }
  | { readonly ok: false; readonly reason: 'conflict'; readonly cloudCurrent: CloudSaveVersionSummary | undefined }
  | { readonly ok: false; readonly reason: 'not-registered' | 'error'; readonly message: string };

export type PullResult =
  | { readonly ok: true; readonly envelope: SaveEnvelope }
  | { readonly ok: false; readonly reason: 'no-cloud-version' }
  | { readonly ok: false; readonly reason: 'invalid-payload'; readonly error: SaveDecodeError };

/**
 * Client-side sync policy against the storage-agnostic `CloudSaveClient`.
 * Push/pull are the only two operations; every conflict is surfaced
 * explicitly (`resolveSyncConflict` below) rather than resolved silently,
 * per the "silent last-write-wins is prohibited" requirement.
 */
export class PrisonSyncEngine {
  public constructor(private readonly client: CloudSaveClient) {}

  public async push(prisonId: string, envelope: SaveEnvelope): Promise<PushResult> {
    const result = await this.client.uploadVersion(prisonId, envelope.revision, envelope);
    switch (result.status) {
      case 'created':
        return { ok: true, outcome: 'uploaded', revision: result.version.revision };
      case 'idempotent-replay':
        return { ok: true, outcome: 'already-synced', revision: result.version.revision };
      case 'conflict':
        return { ok: false, reason: 'conflict', cloudCurrent: result.cloudCurrent };
      case 'not-registered':
        return { ok: false, reason: 'not-registered', message: `Prison "${prisonId}" is not registered in the cloud.` };
      case 'error':
        return { ok: false, reason: 'error', message: result.message };
    }
  }

  public async pull(prisonId: string): Promise<PullResult> {
    const state = await this.client.getPrisonState(prisonId);
    if (state?.currentVersion === undefined) return { ok: false, reason: 'no-cloud-version' };

    const raw = await this.client.downloadVersion(prisonId, state.currentVersion.versionId);
    if (raw === undefined) return { ok: false, reason: 'no-cloud-version' };

    const decoded = decodeSaveEnvelope(raw);
    return decoded.ok ? { ok: true, envelope: decoded.value } : { ok: false, reason: 'invalid-payload', error: decoded.error };
  }
}

export type ConflictChoice = 'keep-local' | 'keep-cloud' | 'duplicate' | 'cancel';

export type ConflictResolutionAction =
  /** Re-push the same local content against the cloud's now-known current revision. */
  | { readonly kind: 'retry-push'; readonly newRevision: number }
  /** Download and locally adopt the cloud version; the caller must have gotten explicit user confirmation to discard local changes, since this is not silent last-write-wins. */
  | { readonly kind: 'pull-and-adopt' }
  /** Keep the local content, but as a brand-new prison; the original cloud prison and its history are untouched. */
  | { readonly kind: 'duplicate-as-new-prison' }
  | { readonly kind: 'cancel' };

/**
 * Maps a user's conflict choice to the next action, without performing it
 * — the caller (not yet built; there is no session/save UI) is
 * responsible for actually calling `push`/`pull`/repository methods.
 * `cloudCurrent` is whatever `PushResult`'s conflict case reported.
 */
export function resolveSyncConflict(
  choice: ConflictChoice,
  cloudCurrent: CloudSaveVersionSummary | undefined,
): ConflictResolutionAction {
  switch (choice) {
    case 'keep-local':
      return { kind: 'retry-push', newRevision: (cloudCurrent?.revision ?? 0) + 1 };
    case 'keep-cloud':
      return { kind: 'pull-and-adopt' };
    case 'duplicate':
      return { kind: 'duplicate-as-new-prison' };
    case 'cancel':
      return { kind: 'cancel' };
  }
}
