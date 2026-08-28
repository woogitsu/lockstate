import { readableGenerationIds } from '../../persistence/local/generation-policy';
import type { PrisonSlotMetadata } from '../../persistence/local/store';
import { orderPrisonsForDisplay } from '../save-panel';
import { type AccountSessionState, hasCloudIdentity } from './account-session';

/**
 * One row per prison, folded from local slot metadata and cloud metadata.
 *
 * #34: "Save list accurately distinguishes local, cloud, pending, conflict and
 * recoverable states." This module is that fold, and it is a pure function so
 * that the distinction can be proven in `pnpm test` -- `vitest.config.ts` runs
 * `environment: 'node'`, so the panel that renders these rows is reachable
 * only from the browser suite. The rule the panel already follows for
 * ordering (`orderPrisonsForDisplay`, #445) was extracted for exactly this
 * reason and is reused here rather than re-derived.
 *
 * **Metadata only.** #34's performance requirement is that the save list
 * "loads without downloading every full snapshot"; nothing in this file's
 * inputs is a payload, and nothing here reads one.
 *
 * **No import from `src/persistence/cloud/`.** The cloud metadata this folds
 * is declared structurally below. That tree is parked by ADR 0044 and its
 * gate, `tests/foundation/trusted-tier-reachability-contract.test.ts`, fires
 * the moment the production graph reaches it -- which should happen on the
 * commit that genuinely wires cloud save, not on a projection that merely
 * describes its shape.
 */

/**
 * What the projection needs to know about a prison's cloud row.
 *
 * Structurally a subset of what `prisons` carries and of what
 * `CloudPrisonState` reports; the adapter between them belongs with the code
 * that performs the read, which does not exist yet. `revision` is
 * `prisons.current_revision` -- 0 for a registered prison with no accepted
 * version.
 */
export interface CloudPrisonMetadata {
  readonly prisonId: string;
  readonly revision: number;
  readonly updatedAt: number;
  readonly displayName?: string;
}

/** A push attempt that failed for a reason that is *not* a revision conflict; conflicts are derived below, never reported. */
export type SyncFailureReason = 'offline' | 'not-registered' | 'rejected' | 'error';

export type PrisonSyncStatus =
  /** Playable, and not backed up: either there is no cloud identity, or this prison has no cloud row. */
  | 'local-only'
  /** A cloud row with no local slot -- another device's prison, available to download. */
  | 'cloud-only'
  | 'synced'
  /** Unsynced local work, and a push can succeed as-is. */
  | 'sync-pending'
  /** Unsynced local work that cannot be attempted right now. Retry, do not resolve. */
  | 'sync-offline'
  /** A push was attempted and refused for a non-conflict reason. */
  | 'sync-failed'
  /** A push cannot succeed without one of #20's explicit, non-destructive choices. */
  | 'conflict';

/**
 * Why a push cannot succeed, which decides which of #20's choices make sense.
 *
 * `cloud-ahead` is the ordinary multi-device case: another device advanced the
 * prison, so keep-local / keep-cloud / duplicate all apply.
 *
 * `local-ahead-of-cloud-baseline` is the offline case and is not the same
 * event. `create_save_version` accepts only `current_revision + 1`, and
 * `PrisonSaveRepository.markPendingSync` overwrites, so N offline saves leave
 * the local revision N ahead of a cloud that has not moved at all. Nothing
 * has diverged and there is nothing to choose between -- the local copy is
 * strictly newer -- but the push still cannot be made as-is. Collapsing it
 * into `cloud-ahead` would offer the player a choice between their own work
 * and an older copy of their own work.
 */
export type SyncConflictReason = 'cloud-ahead' | 'local-ahead-of-cloud-baseline';

export type PrisonRecoveryStatus =
  | 'none'
  /** More than one generation is retained, so `demoteGeneration` has somewhere to fall back to (#19). */
  | 'recoverable'
  /** A slot exists and holds no generation at all -- the orphan #65 found. Visible, selectable and unloadable. */
  | 'no-readable-generation';

export interface SaveListRow {
  readonly prisonId: string;
  readonly displayName: string | undefined;
  readonly availability: 'local-only' | 'cloud-only' | 'local-and-cloud';
  /**
   * The local revision, when it is knowable.
   *
   * `PrisonSlotMetadata` does not carry one: the only place a revision is
   * recorded locally is `pendingSync.dirtySinceRevision`, which
   * `clearPendingSync` deletes outright. So a fully synced prison reports
   * `undefined` here rather than a number this layer would have had to invent.
   */
  readonly localRevision: number | undefined;
  readonly cloudRevision: number | undefined;
  readonly lastPlayedAt: number;
  readonly sync: PrisonSyncStatus;
  readonly conflict: SyncConflictReason | undefined;
  readonly failure: SyncFailureReason | undefined;
  readonly recovery: PrisonRecoveryStatus;
  readonly retainedGenerations: number;
}

export interface SaveListProjectionInput {
  readonly account: AccountSessionState;
  readonly local: readonly PrisonSlotMetadata[];
  /**
   * The cloud index as last read. Ignored entirely when the account has no
   * cloud identity -- a signed-out device must not render rows belonging to
   * the account it just left.
   */
  readonly cloud: readonly CloudPrisonMetadata[];
  readonly connectivity: 'online' | 'offline';
  /** Per-prison record of the last non-conflict push failure, keyed by prison id. */
  readonly failures?: Readonly<Record<string, SyncFailureReason>>;
}

/**
 * Quarantined generations are deliberately not counted (#432). One is a copy
 * this build has just refused as unreadable and kept for a build that can read
 * it; reporting a prison as `recoverable` on the strength of one would promise
 * the player a fallback this build cannot perform. Whether they should be told
 * that such a copy exists is a new player-visible promise and therefore the
 * owner's -- see `readableGenerationIds`.
 */
function recoveryOf(slot: PrisonSlotMetadata): PrisonRecoveryStatus {
  if (slot.currentGenerationId === undefined) return 'no-readable-generation';
  return readableGenerationIds(slot.generationIds).length > 1 ? 'recoverable' : 'none';
}

function conflictOf(localRevision: number, cloudRevision: number): SyncConflictReason | undefined {
  if (cloudRevision >= localRevision) return 'cloud-ahead';
  // `create_save_version` accepts p_new_revision == current_revision + 1 and
  // nothing else, so anything short of that is unpushable as-is.
  return cloudRevision === localRevision - 1 ? undefined : 'local-ahead-of-cloud-baseline';
}

function rowForLocal(
  slot: PrisonSlotMetadata,
  cloud: CloudPrisonMetadata | undefined,
  input: SaveListProjectionInput,
): SaveListRow {
  const localRevision = slot.pendingSync?.dirtySinceRevision;
  const failure = input.failures?.[slot.prisonId];
  const base = {
    prisonId: slot.prisonId,
    displayName: slot.displayName,
    localRevision,
    cloudRevision: cloud?.revision,
    lastPlayedAt: slot.updatedAt,
    recovery: recoveryOf(slot),
    retainedGenerations: readableGenerationIds(slot.generationIds).length,
  } as const;

  if (cloud === undefined) {
    // No cloud row: nothing to conflict with and nothing to report as failed
    // to sync *to*. `local-only` is the honest state whether that is because
    // the player never signed in or because this prison was never registered.
    return { ...base, availability: 'local-only', sync: 'local-only', conflict: undefined, failure: undefined };
  }

  const conflict = localRevision === undefined ? undefined : conflictOf(localRevision, cloud.revision);
  const availability = 'local-and-cloud' as const;

  // Precedence, most actionable first. A conflict outranks a recorded failure
  // because the two are usually the same event seen from different sides --
  // the push that failed is the push that conflicted -- and only the conflict
  // says which of #20's choices apply.
  if (conflict !== undefined) return { ...base, availability, sync: 'conflict', conflict, failure };
  if (failure !== undefined) return { ...base, availability, sync: 'sync-failed', conflict: undefined, failure };
  if (localRevision === undefined) {
    return { ...base, availability, sync: 'synced', conflict: undefined, failure: undefined };
  }
  return {
    ...base,
    availability,
    sync: input.connectivity === 'offline' ? 'sync-offline' : 'sync-pending',
    conflict: undefined,
    failure: undefined,
  };
}

function rowForCloudOnly(cloud: CloudPrisonMetadata): SaveListRow {
  return {
    prisonId: cloud.prisonId,
    displayName: cloud.displayName,
    availability: 'cloud-only',
    localRevision: undefined,
    cloudRevision: cloud.revision,
    lastPlayedAt: cloud.updatedAt,
    sync: 'cloud-only',
    conflict: undefined,
    failure: undefined,
    // There are no local generations to recover from, which is a different
    // fact from "there is nothing wrong"; `availability` is what says so.
    recovery: 'none',
    retainedGenerations: 0,
  };
}

/**
 * Folds local and cloud metadata into the rows the save list renders.
 *
 * Ordering is most-recently-played first. Local rows are seeded in
 * `orderPrisonsForDisplay`'s order so the existing panel rule is inherited
 * rather than restated, cloud-only rows are appended in their own
 * newest-first order with an id tie-break, and one stable sort over
 * `lastPlayedAt` merges the two -- `Array.prototype.sort` is required to be
 * stable, so a tie keeps the order established here instead of depending on
 * which list a row came out of.
 */
export function projectSaveList(input: SaveListProjectionInput): readonly SaveListRow[] {
  const cloudVisible = hasCloudIdentity(input.account);
  const cloudById = new Map<string, CloudPrisonMetadata>();
  if (cloudVisible) {
    for (const entry of input.cloud) cloudById.set(entry.prisonId, entry);
  }

  const localIds = new Set(input.local.map((slot) => slot.prisonId));
  const rows = orderPrisonsForDisplay(input.local).map((slot) => rowForLocal(slot, cloudById.get(slot.prisonId), input));

  const cloudOnly = [...cloudById.values()]
    .filter((entry) => !localIds.has(entry.prisonId))
    .sort((a, b) => b.updatedAt - a.updatedAt || (a.prisonId < b.prisonId ? -1 : a.prisonId > b.prisonId ? 1 : 0))
    .map(rowForCloudOnly);

  return [...rows, ...cloudOnly].sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
}
