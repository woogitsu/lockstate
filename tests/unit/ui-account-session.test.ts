import { describe, expect, it } from 'vitest';
import {
  DESTRUCTIVE_ACCOUNT_EFFECTS,
  INITIAL_ACCOUNT_SESSION_STATE,
  type AccountEvent,
  type AccountSessionState,
  accountIdOf,
  applyAccountEvent,
  hasCloudIdentity,
} from '../../src/ui/account/account-session';
import {
  ACCOUNT_PREFERENCES_VERSION,
  DEFAULT_ACCOUNT_PREFERENCES,
  forgetAccountIdentity,
  loadAccountPreferences,
  saveAccountPreferences,
} from '../../src/ui/account/account-preferences';
import type { KeyValueStore } from '../../src/shared/key-value-store';

const ACCOUNT = 'a3f1c2d4-0000-4000-8000-000000000001';

/**
 * One representative of every state and every event, as `Record`s keyed on the
 * discriminant.
 *
 * The type annotation is the whole mechanism: a state or an event added to
 * `src/ui/account/account-session.ts` makes this file fail to **typecheck**
 * until it is represented here, so the cross-product invariant below can never
 * quietly stop covering the machine. A hand-written array would have gone
 * stale silently.
 */
const STATES: Readonly<Record<AccountSessionState['kind'], AccountSessionState>> = {
  'local-only': { kind: 'local-only', reason: 'never-signed-in' },
  'signing-in': { kind: 'signing-in' },
  anonymous: { kind: 'anonymous', accountId: ACCOUNT },
  linking: { kind: 'linking', accountId: ACCOUNT, provider: 'email' },
  linked: { kind: 'linked', accountId: ACCOUNT, provider: 'email' },
};

const EVENTS: Readonly<Record<AccountEvent['type'], AccountEvent>> = {
  'sign-in-anonymously': { type: 'sign-in-anonymously' },
  'anonymous-sign-in-succeeded': { type: 'anonymous-sign-in-succeeded', accountId: ACCOUNT },
  'anonymous-sign-in-failed': { type: 'anonymous-sign-in-failed', reason: 'offline' },
  'link-identity': { type: 'link-identity', provider: 'email' },
  'link-succeeded': { type: 'link-succeeded' },
  'link-failed': { type: 'link-failed', reason: 'offline' },
  'sign-out': { type: 'sign-out' },
  'session-expired': { type: 'session-expired' },
  'delete-local-data': { type: 'delete-local-data' },
};

const EVERY_PAIR = Object.values(STATES).flatMap((state) => Object.values(EVENTS).map((event) => ({ state, event })));

describe('the account session machine covers local-only, anonymous and linked (#34)', () => {
  it('walks a player from never having signed in to a permanent identity', () => {
    const signingIn = applyAccountEvent(INITIAL_ACCOUNT_SESSION_STATE, { type: 'sign-in-anonymously' });
    expect(signingIn.state).toEqual({ kind: 'signing-in' });
    expect(signingIn.effects).toEqual(['begin-anonymous-sign-in']);

    const anonymous = applyAccountEvent(signingIn.state, { type: 'anonymous-sign-in-succeeded', accountId: ACCOUNT });
    expect(anonymous.state).toEqual({ kind: 'anonymous', accountId: ACCOUNT });

    const linking = applyAccountEvent(anonymous.state, { type: 'link-identity', provider: 'email' });
    expect(linking.state).toEqual({ kind: 'linking', accountId: ACCOUNT, provider: 'email' });

    const linked = applyAccountEvent(linking.state, { type: 'link-succeeded' });
    expect(linked.state).toEqual({ kind: 'linked', accountId: ACCOUNT, provider: 'email' });
    // The identity the cloud rows are owned by must not change across the
    // upgrade; that it does not is the property #20's unticked "linked/upgraded
    // without losing existing prisons" criterion rests on.
    expect(accountIdOf(linked.state)).toBe(ACCOUNT);
  });

  it('reaches every state it declares, so none of them is unreachable decoration', () => {
    const reached = new Set<AccountSessionState['kind']>([INITIAL_ACCOUNT_SESSION_STATE.kind]);
    const frontier: AccountSessionState[] = [INITIAL_ACCOUNT_SESSION_STATE];
    while (frontier.length > 0) {
      const state = frontier.pop() as AccountSessionState;
      for (const event of Object.values(EVENTS)) {
        const next = applyAccountEvent(state, event).state;
        if (reached.has(next.kind)) continue;
        reached.add(next.kind);
        frontier.push(next);
      }
    }
    expect([...reached].sort()).toEqual(Object.keys(STATES).sort());
  });

  it('answers every state/event pair rather than throwing on the ones that make no sense', () => {
    for (const { state, event } of EVERY_PAIR) {
      const transition = applyAccountEvent(state, event);
      expect(transition.state.kind, `${state.kind} + ${event.type}`).toBeTypeOf('string');
    }
    // The cross product is only worth asserting over if it is a cross product.
    expect(EVERY_PAIR.length).toBe(Object.keys(STATES).length * Object.keys(EVENTS).length);
  });

  it('leaves the state object identical when an event does not apply', () => {
    const anonymous = STATES.anonymous;
    const transition = applyAccountEvent(anonymous, { type: 'link-succeeded' });
    expect(transition.ignored).toBe(true);
    expect(transition.state).toBe(anonymous);
    expect(transition.effects).toEqual([]);
  });
});

describe('nothing but an explicit deletion request may destroy local saves (#34)', () => {
  /**
   * "Local data is not deleted merely because linking fails" is #34's
   * architecture note, and it is stated here over the **whole** state x event
   * cross product rather than against the one transition it names -- the same
   * mistake is available in eight other places.
   *
   * The expectation is derived from the *event's own name*, never from the
   * reducer's answer, so it cannot be satisfied by whatever the reducer
   * happens to do.
   */
  it('discards local data on `delete-local-data` and on no other event, in no state', () => {
    for (const { state, event } of EVERY_PAIR) {
      const transition = applyAccountEvent(state, event);
      const isTheDeletionRequest = event.type === 'delete-local-data';
      expect(transition.localData, `${state.kind} + ${event.type}`).toBe(
        isTheDeletionRequest ? 'discarded' : 'preserved',
      );
      expect(
        transition.effects.filter((effect) => DESTRUCTIVE_ACCOUNT_EFFECTS.has(effect)),
        `${state.kind} + ${event.type}`,
      ).toEqual(isTheDeletionRequest ? ['discard-local-saves'] : []);
    }
  });

  it('observes both dispositions, so the assertion above is not vacuously true of one of them', () => {
    const dispositions = new Set(EVERY_PAIR.map(({ state, event }) => applyAccountEvent(state, event).localData));
    expect([...dispositions].sort()).toEqual(['discarded', 'preserved']);
  });

  it('does not sign the player out when they delete this device\'s saves', () => {
    // Erasing local saves says nothing about the cloud copy, and reporting it
    // as a sign-out would misstate the half the player did not ask about.
    for (const state of Object.values(STATES)) {
      const transition = applyAccountEvent(state, { type: 'delete-local-data' });
      expect(transition.state, state.kind).toBe(state);
    }
  });
});

describe('a failed account upgrade is recoverable, not destructive (#34)', () => {
  it('returns to the same anonymous account the link attempt started from', () => {
    const linking = applyAccountEvent(STATES.anonymous, { type: 'link-identity', provider: 'oauth' }).state;
    const failed = applyAccountEvent(linking, { type: 'link-failed', reason: 'offline' });

    expect(failed.state).toEqual({
      kind: 'anonymous',
      accountId: ACCOUNT,
      lastLinkFailure: { provider: 'oauth', reason: 'offline' },
    });
    // Still signed in, so the cloud prisons this account already owns stay
    // listed and loadable while the player retries.
    expect(hasCloudIdentity(failed.state)).toBe(true);
    expect(accountIdOf(failed.state)).toBe(accountIdOf(linking));
    expect(failed.effects).toEqual([]);
  });

  it('records the provider that failed, so a retry can be offered for the right one', () => {
    const viaEmail = applyAccountEvent(
      applyAccountEvent(STATES.anonymous, { type: 'link-identity', provider: 'email' }).state,
      { type: 'link-failed', reason: 'rejected' },
    ).state;
    expect(viaEmail).toMatchObject({ lastLinkFailure: { provider: 'email', reason: 'rejected' } });
  });
});

describe('leaving an account takes its cached entitlements with it', () => {
  it('clears the projection on sign-out and on session expiry, from every state that has an identity', () => {
    for (const state of [STATES.anonymous, STATES.linking, STATES.linked]) {
      for (const event of [EVENTS['sign-out'], EVENTS['session-expired']]) {
        const transition = applyAccountEvent(state, event);
        expect(transition.state.kind, `${state.kind} + ${event.type}`).toBe('local-only');
        expect(transition.effects, `${state.kind} + ${event.type}`).toEqual(['clear-cached-entitlement-projection']);
      }
    }
  });

  it('distinguishes signing out from a session that expired underneath the player', () => {
    expect(applyAccountEvent(STATES.linked, { type: 'sign-out' }).state).toEqual({
      kind: 'local-only',
      reason: 'signed-out',
    });
    expect(applyAccountEvent(STATES.linked, { type: 'session-expired' }).state).toEqual({
      kind: 'local-only',
      reason: 'session-expired',
    });
  });

  it('clears nothing when a sign-in never established an identity to clear', () => {
    const failed = applyAccountEvent(STATES['signing-in'], { type: 'anonymous-sign-in-failed', reason: 'offline' });
    expect(failed.state).toEqual({ kind: 'local-only', reason: 'sign-in-failed' });
    expect(failed.effects).toEqual([]);
  });
});

class MemoryKeyValueStore implements KeyValueStore {
  private readonly entries = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }

  /** The raw slot, so a test can assert what would actually be on the player's disk. */
  public only(): string | undefined {
    return [...this.entries.values()][0];
  }
}

describe('account preferences are versioned, and degrade towards local-only', () => {
  it('reports the defaults when nothing has been stored', () => {
    expect(loadAccountPreferences(new MemoryKeyValueStore())).toEqual(DEFAULT_ACCOUNT_PREFERENCES);
  });

  it('starts a new player opted out, so local play needs no registration', () => {
    expect(DEFAULT_ACCOUNT_PREFERENCES.cloudSaveOptIn).toBe(false);
    expect(DEFAULT_ACCOUNT_PREFERENCES.cloudSaveOfferSeen).toBe(false);
  });

  it('round-trips a stored choice', () => {
    const store = new MemoryKeyValueStore();
    saveAccountPreferences(store, {
      version: ACCOUNT_PREFERENCES_VERSION,
      cloudSaveOptIn: true,
      cloudSaveOfferSeen: true,
      lastAccountId: ACCOUNT,
    });
    expect(loadAccountPreferences(store)).toEqual({
      version: ACCOUNT_PREFERENCES_VERSION,
      cloudSaveOptIn: true,
      cloudSaveOfferSeen: true,
      lastAccountId: ACCOUNT,
    });
  });

  it('refuses a record carrying anything it did not declare, so a credential cannot be read back out of it', () => {
    // #34, Out of scope: "storing account/session credentials in prison
    // snapshots". The same rule is worth holding one level out -- this record
    // is the only account-shaped thing the client writes to disk, and a strict
    // schema is what stops a token surviving a reload once something has put
    // one here.
    const store = new MemoryKeyValueStore();
    store.setItem('lockstate.account.preferences', JSON.stringify({
      version: ACCOUNT_PREFERENCES_VERSION,
      cloudSaveOptIn: true,
      cloudSaveOfferSeen: true,
      accessToken: 'ey.aaa.bbb',
    }));
    expect(loadAccountPreferences(store)).toEqual(DEFAULT_ACCOUNT_PREFERENCES);
  });

  it('writes no field it was not given', () => {
    const store = new MemoryKeyValueStore();
    saveAccountPreferences(store, DEFAULT_ACCOUNT_PREFERENCES);
    expect(Object.keys(JSON.parse(store.only() ?? '{}')).sort()).toEqual([
      'cloudSaveOfferSeen',
      'cloudSaveOptIn',
      'version',
    ]);
  });

  it('falls back to the defaults for a record from a version it cannot read', () => {
    const store = new MemoryKeyValueStore();
    store.setItem('lockstate.account.preferences', JSON.stringify({ version: ACCOUNT_PREFERENCES_VERSION + 1, cloudSaveOptIn: true }));
    expect(loadAccountPreferences(store)).toEqual(DEFAULT_ACCOUNT_PREFERENCES);
  });

  it('falls back to the defaults for a record that does not say which version it is', () => {
    const store = new MemoryKeyValueStore();
    store.setItem('lockstate.account.preferences', JSON.stringify({ cloudSaveOptIn: true, cloudSaveOfferSeen: true }));
    expect(loadAccountPreferences(store)).toEqual(DEFAULT_ACCOUNT_PREFERENCES);
  });

  it('falls back to the defaults for a slot that is not JSON at all', () => {
    const store = new MemoryKeyValueStore();
    store.setItem('lockstate.account.preferences', 'not json');
    expect(loadAccountPreferences(store)).toEqual(DEFAULT_ACCOUNT_PREFERENCES);
  });

  it('forgets the account id on sign-out and keeps the choice the player made', () => {
    const after = forgetAccountIdentity({
      version: ACCOUNT_PREFERENCES_VERSION,
      cloudSaveOptIn: true,
      cloudSaveOfferSeen: true,
      lastAccountId: ACCOUNT,
    });
    expect(after).toEqual({ version: ACCOUNT_PREFERENCES_VERSION, cloudSaveOptIn: true, cloudSaveOfferSeen: true });
    expect('lastAccountId' in after).toBe(false);
  });
});
