import { describe, expect, it } from 'vitest';
import type { PrisonSlotMetadata } from '../../src/persistence/local/store';
import type { AccountSessionState } from '../../src/ui/account/account-session';
import {
  type CloudPrisonMetadata,
  type SaveListProjectionInput,
  projectSaveList,
} from '../../src/ui/account/save-list-projection';
import { projectCloudSlotAvailability } from '../../src/ui/account/cloud-slot-availability';
import {
  ENTITLEMENT_PROJECTION_VERSION,
  type EntitlementProjection,
} from '../../src/services/entitlements/projection';

const ACCOUNT = 'a3f1c2d4-0000-4000-8000-000000000001';
const ANONYMOUS: AccountSessionState = { kind: 'anonymous', accountId: ACCOUNT };
const LOCAL_ONLY: AccountSessionState = { kind: 'local-only', reason: 'never-signed-in' };

interface SlotOverrides {
  readonly displayName?: string;
  readonly updatedAt?: number;
  readonly generationIds?: readonly string[];
  readonly currentGenerationId?: string | undefined;
  /** The prison's true current local revision (`PrisonSlotMetadata.currentRevision`), what this projection now reads (#1097). */
  readonly currentRevision?: number;
  /**
   * `pendingSync.dirtySinceRevision` -- kept as its own override, distinct
   * from `currentRevision`, precisely to exercise #1097's fix: this
   * projection no longer reads it, so a slot can carry a stale or absent
   * marker here without affecting `localRevision` or `sync` at all.
   */
  readonly dirtySinceRevision?: number;
}

function slot(prisonId: string, overrides: SlotOverrides = {}): PrisonSlotMetadata {
  const generationIds = overrides.generationIds ?? ['gen-1'];
  return {
    prisonId,
    gameVersion: 'lockstate-0.0.0',
    ...(overrides.displayName === undefined ? {} : { displayName: overrides.displayName }),
    currentGenerationId: 'currentGenerationId' in overrides ? overrides.currentGenerationId : generationIds.at(-1),
    ...(overrides.currentRevision === undefined ? {} : { currentRevision: overrides.currentRevision }),
    generationIds,
    createdAt: 1_000,
    updatedAt: overrides.updatedAt ?? 2_000,
    ...(overrides.dirtySinceRevision === undefined
      ? {}
      : { pendingSync: { dirtySinceRevision: overrides.dirtySinceRevision, markedAt: 2_000 } }),
  };
}

function cloud(prisonId: string, revision: number, updatedAt = 2_000): CloudPrisonMetadata {
  return { prisonId, revision, updatedAt };
}

function project(overrides: Partial<SaveListProjectionInput>): ReturnType<typeof projectSaveList> {
  return projectSaveList({ account: ANONYMOUS, local: [], cloud: [], connectivity: 'online', ...overrides });
}

describe('the save list distinguishes where each prison actually lives (#34)', () => {
  it('marks a prison that exists only on this device', () => {
    const [row] = project({ local: [slot('p1')] });
    expect(row).toMatchObject({ prisonId: 'p1', availability: 'local-only', sync: 'local-only', cloudRevision: undefined });
  });

  it('marks a prison that exists only in the cloud, so another device\'s save is offerable', () => {
    const [row] = project({ cloud: [cloud('p2', 4)] });
    expect(row).toMatchObject({ prisonId: 'p2', availability: 'cloud-only', sync: 'cloud-only', cloudRevision: 4 });
  });

  it('marks a prison that exists in both', () => {
    const [row] = project({ local: [slot('p1')], cloud: [cloud('p1', 3)] });
    expect(row).toMatchObject({ prisonId: 'p1', availability: 'local-and-cloud', sync: 'synced' });
  });

  it('renders no cloud row at all once the player has signed out', () => {
    // A device that has left an account must not keep listing that account's
    // prisons -- #34's "sign-out/device-change behavior". The cloud index is
    // handed in deliberately here: the projection has to refuse it, not rely
    // on the caller having cleared it.
    const rows = project({ account: LOCAL_ONLY, local: [slot('p1')], cloud: [cloud('p1', 3), cloud('p2', 1)] });
    expect(rows.map((row) => row.prisonId)).toEqual(['p1']);
    expect(rows[0]).toMatchObject({ availability: 'local-only', sync: 'local-only', cloudRevision: undefined });
  });
});

describe('the save list says whether a push can actually be made (#34, #20)', () => {
  /**
   * The numbers are the RPC's, not this projection's:
   * `create_save_version` accepts `p_new_revision = current_revision + 1` and
   * answers `conflict` to everything else
   * (`supabase/migrations/20260822190300_create_save_version_rpc.sql:132`).
   * Four points around that boundary, three distinct outcomes -- so an
   * implementation with a different rule cannot satisfy all four.
   */
  it('reports sync-pending only when the local revision is exactly one past the cloud', () => {
    const [row] = project({ local: [slot('p1', { currentRevision: 4 })], cloud: [cloud('p1', 3)] });
    expect(row).toMatchObject({ sync: 'sync-pending', conflict: undefined, localRevision: 4, cloudRevision: 3 });
  });

  it('reports a cloud-ahead conflict when another device has already taken the next revision', () => {
    const [row] = project({ local: [slot('p1', { currentRevision: 4 })], cloud: [cloud('p1', 5)] });
    expect(row).toMatchObject({ sync: 'conflict', conflict: 'cloud-ahead' });
  });

  it('reports a cloud-ahead conflict when the cloud has moved several revisions on', () => {
    const [row] = project({ local: [slot('p1', { currentRevision: 4 })], cloud: [cloud('p1', 9)] });
    expect(row).toMatchObject({ sync: 'conflict', conflict: 'cloud-ahead' });
  });

  it('distinguishes a local copy that has simply run ahead offline from a genuine divergence', () => {
    // Five offline saves from cloud revision 3. Nothing diverged -- the local
    // copy is strictly newer -- but the push still cannot be made as-is.
    // Calling this `cloud-ahead` would offer a choice between the player's own
    // work and an older copy of it.
    const [row] = project({ local: [slot('p1', { currentRevision: 8 })], cloud: [cloud('p1', 3)] });
    expect(row).toMatchObject({ sync: 'conflict', conflict: 'local-ahead-of-cloud-baseline' });
  });

  it('reports a prison with nothing unsynced as synced, and claims no revision it does not know', () => {
    const [row] = project({ local: [slot('p1')], cloud: [cloud('p1', 7)] });
    expect(row).toMatchObject({ sync: 'synced', localRevision: undefined, cloudRevision: 7 });
  });

  it('reports a prison whose local revision exactly matches the cloud as synced, not as a conflict', () => {
    // `currentRevision` is written on every save and never cleared, so unlike
    // the old `pendingSync`-backed marker it stays defined long after a
    // prison is genuinely caught up. Calling `conflictOf` on equal revisions
    // would answer `cloud-ahead` on a prison with nothing left to push.
    const [row] = project({ local: [slot('p1', { currentRevision: 7 })], cloud: [cloud('p1', 7)] });
    expect(row).toMatchObject({ sync: 'synced', conflict: undefined, localRevision: 7, cloudRevision: 7 });
  });

  /**
   * The exact defect #1097 measured: `markPendingSync` has one caller, inside
   * `saveNow`, and the interval autosave never reaches it -- so
   * `pendingSync.dirtySinceRevision` can freeze at an old revision while the
   * durable one moves on. Numbers match the issue's own repro (marker at 5,
   * true local revision 8, cloud at 5) rather than a paraphrase of it: the old
   * reader answered `{"sync":"conflict","conflict":"cloud-ahead"}` here,
   * offering "keep cloud" over three good autosaves.
   */
  it('#1097: a stale, low pendingSync marker does not turn a prison that is strictly ahead into a cloud-ahead conflict', () => {
    const [row] = project({
      local: [slot('p1', { currentRevision: 8, dirtySinceRevision: 5 })],
      cloud: [cloud('p1', 5)],
    });
    expect(row?.conflict).not.toBe('cloud-ahead');
    expect(row).toMatchObject({
      sync: 'conflict',
      conflict: 'local-ahead-of-cloud-baseline',
      localRevision: 8,
      cloudRevision: 5,
    });
  });
});

describe('the save list is understandable offline, and says what a retry would do (#34)', () => {
  it('reports unsynced work as offline rather than pending when the device cannot reach the cloud', () => {
    const [row] = project({
      local: [slot('p1', { currentRevision: 4 })],
      cloud: [cloud('p1', 3)],
      connectivity: 'offline',
    });
    expect(row).toMatchObject({ sync: 'sync-offline' });
  });

  it('turns the same prison into a pending push as soon as the device is back online', () => {
    // Same local and cloud state; connectivity is the only difference, which
    // is what makes "this will retry" honest guidance rather than a label.
    const input = { local: [slot('p1', { currentRevision: 4 })], cloud: [cloud('p1', 3)] } as const;
    expect(project({ ...input, connectivity: 'offline' })[0]?.sync).toBe('sync-offline');
    expect(project({ ...input, connectivity: 'online' })[0]?.sync).toBe('sync-pending');
  });

  it('reports a push that was refused for a non-conflict reason as failed, with the reason', () => {
    const [row] = project({
      local: [slot('p1', { currentRevision: 4 })],
      cloud: [cloud('p1', 3)],
      failures: { p1: 'not-registered' },
    });
    expect(row).toMatchObject({ sync: 'sync-failed', failure: 'not-registered', conflict: undefined });
  });

  it('reports a conflict rather than a failure when the revisions say the push cannot succeed', () => {
    // The failed push and the conflict are usually the same event; only the
    // conflict says which of #20's choices apply, so it is the one shown.
    const [row] = project({
      local: [slot('p1', { currentRevision: 4 })],
      cloud: [cloud('p1', 6)],
      failures: { p1: 'error' },
    });
    expect(row).toMatchObject({ sync: 'conflict', conflict: 'cloud-ahead', failure: 'error' });
  });
});

describe('the save list surfaces what local recovery is available (#19, #34)', () => {
  it('marks a prison with more than one retained generation as recoverable', () => {
    const [row] = project({ local: [slot('p1', { generationIds: ['gen-1', 'gen-2', 'gen-3'] })] });
    expect(row).toMatchObject({ recovery: 'recoverable', retainedGenerations: 3 });
  });

  it('marks a prison with a single generation as having nothing to fall back to', () => {
    const [row] = project({ local: [slot('p1', { generationIds: ['gen-1'] })] });
    expect(row).toMatchObject({ recovery: 'none', retainedGenerations: 1 });
  });

  it('marks a slot that holds no generation at all, rather than showing it as an ordinary save', () => {
    // The orphan #65 produced: a row the player can see, select and never load.
    const [row] = project({ local: [slot('p1', { currentGenerationId: undefined, generationIds: [] })] });
    expect(row).toMatchObject({ recovery: 'no-readable-generation', retainedGenerations: 0 });
  });

  /**
   * A quarantined generation is one this build has just refused as unreadable
   * and kept for a build that can read it (#432). Counting it here would tell
   * the player a prison has a copy to fall back to when this build cannot
   * perform that fallback -- a promise the code does not keep, which is
   * `AGENTS.md`'s fourth exclusion. So it is invisible above the persistence
   * layer, and the two numbers this row carries mean exactly what they meant
   * before quarantine existed.
   *
   * Whether the player *should* be told a save is being held for a later
   * build is a new promise and therefore the owner's; it is recorded as an
   * open question rather than answered here.
   */
  it('counts only the generations this build can offer, so a quarantined copy is not a fallback', () => {
    const [row] = project({ local: [slot('p1', { generationIds: ['gen-1', '!unreadable!gen-2'] })] });
    expect(row).toMatchObject({ recovery: 'none', retainedGenerations: 1 });
  });
});

describe('the save list is ordered most recently played first, across both sources', () => {
  /**
   * `expectedOrder` is written out, never derived by sorting the fixture --
   * re-deriving it here would be the comparator under test wearing the test's
   * clothes (the same rule `ui-save-panel-status.test.ts` states for
   * `orderPrisonsForDisplay`, which this projection reuses for its local half).
   */
  const local = [slot('local-old', { updatedAt: 100 }), slot('local-new', { updatedAt: 900 })];
  const cloudRows = [cloud('cloud-mid', 1, 500), cloud('cloud-newest', 1, 950)];
  const expectedOrder = ['cloud-newest', 'local-new', 'cloud-mid', 'local-old'];

  it('has a fixture whose timestamps are distinct and not already in the expected order', () => {
    // Otherwise "sorted newest first" would hold for a projection that did not
    // sort at all.
    const given = [...local.map((s) => s.prisonId), ...cloudRows.map((c) => c.prisonId)];
    expect(given).not.toEqual(expectedOrder);
    const stamps = [...local.map((s) => s.updatedAt), ...cloudRows.map((c) => c.updatedAt)];
    expect(new Set(stamps).size).toBe(stamps.length);
  });

  it('interleaves local and cloud-only rows by when each was last played', () => {
    expect(project({ local, cloud: cloudRows }).map((row) => row.prisonId)).toEqual(expectedOrder);
  });

  it('leaves the list the repository handed it untouched', () => {
    const given = local.map((s) => s.prisonId);
    project({ local, cloud: cloudRows });
    expect(local.map((s) => s.prisonId)).toEqual(given);
  });
});

function projection(grantedSaveSlots: number, verifiedAt: number): EntitlementProjection {
  return {
    version: ENTITLEMENT_PROJECTION_VERSION,
    accountId: ACCOUNT,
    grantedSaveSlots,
    ledgerRevision: 1,
    verifiedAt,
  };
}

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1_000;

describe('the save-slot cap is account metadata, and applies only where the server applies it (#34, ADR 0013)', () => {
  it('does not apply to a player who has never signed in', () => {
    const availability = projectCloudSlotAvailability({
      account: LOCAL_ONLY,
      projection: undefined,
      usedCloudSlots: 0,
      now: NOW,
    });
    expect(availability.applies).toBe(false);
    // Nowhere to create it, which is a different answer from "you are capped"
    // and has to stay distinguishable from it.
    expect(availability.canCreateCloudSlot).toBe(false);
  });

  it('applies as soon as there is a cloud identity', () => {
    const availability = projectCloudSlotAvailability({
      account: ANONYMOUS,
      projection: undefined,
      usedCloudSlots: 0,
      now: NOW,
    });
    expect(availability.applies).toBe(true);
    expect(availability.canCreateCloudSlot).toBe(true);
  });

  it('refuses a new cloud slot once the account is full, and refuses nothing else', () => {
    const full = projectCloudSlotAvailability({
      account: ANONYMOUS,
      projection: undefined,
      usedCloudSlots: 5,
      now: NOW,
    });
    expect(full.canCreateCloudSlot).toBe(false);
    expect(full.usedCloudSlots).toBe(5);
    expect(full.existingPrisonsRemainPlayable).toBe(true);
  });

  it('keeps every existing prison in the list when the account is over capacity', () => {
    // Losing capacity must never hide or lock a prison; it may only stop a new
    // one. The projection above and the list below have to agree about that.
    const overCapacity = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];
    const rows = project({ local: overCapacity.map((id) => slot(id, { updatedAt: 2_000 })) });
    expect(rows.map((row) => row.prisonId).sort()).toEqual([...overCapacity].sort());
  });

  it('reduces capacity when a grant can no longer be confirmed, and never increases it', () => {
    // Relational, not a literal: whatever the free tier and the grant are, a
    // projection that has aged out of the grace window must be worth strictly
    // less than a freshly confirmed one, and the ladder must be consulted for
    // it to be so.
    const fresh = projectCloudSlotAvailability({
      account: ANONYMOUS,
      projection: projection(10, NOW),
      usedCloudSlots: 0,
      now: NOW,
    });
    const stale = projectCloudSlotAvailability({
      account: ANONYMOUS,
      projection: projection(10, NOW - 90 * DAY),
      usedCloudSlots: 0,
      now: NOW,
    });
    const unentitled = projectCloudSlotAvailability({
      account: ANONYMOUS,
      projection: undefined,
      usedCloudSlots: 0,
      now: NOW,
    });

    expect(fresh.trust).toBe('verified');
    expect(stale.trust).toBe('base');
    expect(stale.capacity).toBeLessThan(fresh.capacity);
    // Degrading to the free tier, not to some third number of its own.
    expect(stale.capacity).toBe(unentitled.capacity);
  });

  it('keeps a paid grant usable while the player is offline inside the grace window', () => {
    const cached = projectCloudSlotAvailability({
      account: ANONYMOUS,
      projection: projection(10, NOW - 7 * DAY),
      usedCloudSlots: 0,
      now: NOW,
    });
    expect(cached.trust).toBe('cached');
    expect(cached.capacity).toBeGreaterThan(
      projectCloudSlotAvailability({ account: ANONYMOUS, projection: undefined, usedCloudSlots: 0, now: NOW }).capacity,
    );
  });
});
