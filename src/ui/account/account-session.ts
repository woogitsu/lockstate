/**
 * The client's model of *who the player is*, as a state machine.
 *
 * Issue #34 asks for "local-only start and optional anonymous cloud session"
 * and an "account upgrade/linking flow"; ADR 0043 (this module's decision
 * record) is why those are five states rather than a pair of booleans, and
 * why every transition has to declare what it may do to the player's local
 * saves.
 *
 * **Nothing here talks to Supabase.** This is the reducer; performing an
 * effect -- calling `signInAnonymously`, calling `linkIdentity`, deleting
 * local saves -- belongs to the caller, which does not exist yet. That split
 * is what makes the whole model reachable from `pnpm test`: `vitest.config.ts`
 * runs in `environment: 'node'`, so anything that touches `document` or a
 * network client can only be exercised by the browser suite.
 *
 * **No credential is ever a field of any type in this file.** The states
 * carry an opaque `accountId` and nothing else. A token belongs to the auth
 * SDK's own storage; putting one in application state is how it ends up in a
 * diagnostic dump or, worse, in a save (#34, Out of scope: "storing
 * account/session credentials in prison snapshots").
 */

/**
 * How a permanent identity is attached to an existing anonymous account.
 *
 * Two, not one, because the flows differ in a way the UI has to show: an
 * email link is asynchronous and completes out-of-band after the player
 * follows a message, while an OAuth link completes in a redirect. Naming a
 * specific provider (`google`, `apple`) would be inventing product decisions
 * nobody has made.
 */
export type AccountIdentityProvider = 'email' | 'oauth';

/** Why there is no cloud identity. Never merely "false": the four cases call for different UI. */
export type LocalOnlyReason = 'never-signed-in' | 'signed-out' | 'sign-in-failed' | 'session-expired';

/**
 * Why an attempt to reach the account service did not succeed.
 *
 * `offline` is separated from `error` because it is the one the player can
 * act on -- #34 requires "offline/sync-pending/failed states and retry
 * guidance", and "you are offline, this will retry" is different advice from
 * "the service refused this".
 */
export type AccountFailureReason = 'offline' | 'rejected' | 'already-linked' | 'error';

export interface LinkFailure {
  readonly provider: AccountIdentityProvider;
  readonly reason: AccountFailureReason;
}

export type AccountSessionState =
  | { readonly kind: 'local-only'; readonly reason: LocalOnlyReason }
  | { readonly kind: 'signing-in' }
  /** A real `auth.users` row exists. `lastLinkFailure` is present only after an upgrade attempt failed, so the UI can offer a retry rather than forgetting it happened. */
  | { readonly kind: 'anonymous'; readonly accountId: string; readonly lastLinkFailure?: LinkFailure }
  | { readonly kind: 'linking'; readonly accountId: string; readonly provider: AccountIdentityProvider }
  | { readonly kind: 'linked'; readonly accountId: string; readonly provider: AccountIdentityProvider };

/** The state a player who has never signed in starts in, and the one #34's first criterion is about. */
export const INITIAL_ACCOUNT_SESSION_STATE: AccountSessionState = { kind: 'local-only', reason: 'never-signed-in' };

export type AccountEvent =
  | { readonly type: 'sign-in-anonymously' }
  | { readonly type: 'anonymous-sign-in-succeeded'; readonly accountId: string }
  | { readonly type: 'anonymous-sign-in-failed'; readonly reason: AccountFailureReason }
  | { readonly type: 'link-identity'; readonly provider: AccountIdentityProvider }
  | { readonly type: 'link-succeeded' }
  | { readonly type: 'link-failed'; readonly reason: AccountFailureReason }
  | { readonly type: 'sign-out' }
  | { readonly type: 'session-expired' }
  /** #34's privacy/data-deletion entry point. The only event that may remove the player's saves, and it does not change who they are signed in as. */
  | { readonly type: 'delete-local-data' };

/**
 * What the caller must do next. Descriptors rather than callbacks, so the
 * whole machine stays a pure function and every transition's consequences can
 * be asserted as data.
 */
export type AccountEffect =
  | 'begin-anonymous-sign-in'
  | 'begin-identity-link'
  | 'refresh-entitlement-projection'
  | 'refresh-cloud-save-index'
  /** An entitlement projection must never outlive its account's session (`clearCachedEntitlementProjection`). */
  | 'clear-cached-entitlement-projection'
  | 'discard-local-saves';

/**
 * The effects that destroy player data.
 *
 * Exported as a set rather than left implicit because it is what the
 * invariant in `tests/unit/ui-account-session.test.ts` is stated against: a
 * transition may emit one of these only when it also reports
 * `localData: 'discarded'`, and only one event ever may.
 */
export const DESTRUCTIVE_ACCOUNT_EFFECTS: ReadonlySet<AccountEffect> = new Set<AccountEffect>(['discard-local-saves']);

export type LocalDataDisposition = 'preserved' | 'discarded';

export interface AccountTransition {
  readonly state: AccountSessionState;
  /**
   * Whether this transition is permitted to remove locally stored prisons.
   *
   * #34's architecture note is that "local data is not deleted merely because
   * linking fails". Declaring the disposition on *every* transition rather
   * than trusting each branch not to do the wrong thing is what lets one test
   * hold that over the entire state x event cross product.
   */
  readonly localData: LocalDataDisposition;
  readonly effects: readonly AccountEffect[];
  /** The event did not apply in this state; `state` is exactly the state handed in. */
  readonly ignored: boolean;
}

function stay(state: AccountSessionState): AccountTransition {
  return { state, localData: 'preserved', effects: [], ignored: true };
}

function go(state: AccountSessionState, effects: readonly AccountEffect[]): AccountTransition {
  return { state, localData: 'preserved', effects, ignored: false };
}

/** Effects run on every transition that establishes a usable cloud identity. */
const CLOUD_IDENTITY_ESTABLISHED: readonly AccountEffect[] = ['refresh-entitlement-projection', 'refresh-cloud-save-index'];

/**
 * Leaving a cloud identity behind, for any of the three reasons it happens.
 *
 * The cached entitlement projection goes with it in all three: it is keyed on
 * an account id, and a projection that outlived its session would let the
 * next player on this device inherit the previous one's slot capacity.
 */
function leaveCloudIdentity(reason: LocalOnlyReason): AccountTransition {
  return go({ kind: 'local-only', reason }, ['clear-cached-entitlement-projection']);
}

/**
 * The single reducer. Total: every (state, event) pair has an answer, and a
 * pair with no meaning answers `ignored: true` with the state unchanged
 * rather than throwing -- a stale click from a UI that has already moved on
 * is an ordinary event, not a bug.
 */
export function applyAccountEvent(state: AccountSessionState, event: AccountEvent): AccountTransition {
  // Applies in every state, and deliberately leaves `state` alone: erasing
  // this device's saves is not signing out, and reporting it as a sign-out
  // would misstate the cloud half of what the player just asked for.
  if (event.type === 'delete-local-data') {
    return { state, localData: 'discarded', effects: ['discard-local-saves'], ignored: false };
  }

  switch (state.kind) {
    case 'local-only':
      // `link-identity` is not accepted here on purpose (ADR 0043 decision 1):
      // linking upgrades an existing anonymous `auth.users` row, and a direct
      // sign-in would create a different one, which is an adoption flow rather
      // than an upgrade.
      return event.type === 'sign-in-anonymously' ? go({ kind: 'signing-in' }, ['begin-anonymous-sign-in']) : stay(state);

    case 'signing-in':
      if (event.type === 'anonymous-sign-in-succeeded') {
        return go({ kind: 'anonymous', accountId: event.accountId }, CLOUD_IDENTITY_ESTABLISHED);
      }
      if (event.type === 'anonymous-sign-in-failed') {
        // No `clear-cached-entitlement-projection`: no identity was ever
        // established, so there is nothing of this account's to clear, and
        // there is no account id to have keyed one on.
        return go({ kind: 'local-only', reason: 'sign-in-failed' }, []);
      }
      return event.type === 'sign-out' ? leaveCloudIdentity('signed-out') : stay(state);

    case 'anonymous':
      if (event.type === 'link-identity') {
        return go({ kind: 'linking', accountId: state.accountId, provider: event.provider }, ['begin-identity-link']);
      }
      if (event.type === 'sign-out') return leaveCloudIdentity('signed-out');
      if (event.type === 'session-expired') return leaveCloudIdentity('session-expired');
      return stay(state);

    case 'linking':
      if (event.type === 'link-succeeded') {
        return go({ kind: 'linked', accountId: state.accountId, provider: state.provider }, CLOUD_IDENTITY_ESTABLISHED);
      }
      if (event.type === 'link-failed') {
        // The whole of "non-destructive linking" (#34): the *same* account id
        // comes back out, so the anonymous identity still owns its cloud
        // prisons, nothing local is touched, and the only trace of the attempt
        // is a failure the UI can offer a retry from.
        return go(
          { kind: 'anonymous', accountId: state.accountId, lastLinkFailure: { provider: state.provider, reason: event.reason } },
          [],
        );
      }
      if (event.type === 'sign-out') return leaveCloudIdentity('signed-out');
      if (event.type === 'session-expired') return leaveCloudIdentity('session-expired');
      return stay(state);

    case 'linked':
      if (event.type === 'sign-out') return leaveCloudIdentity('signed-out');
      if (event.type === 'session-expired') return leaveCloudIdentity('session-expired');
      return stay(state);
  }
}

/** The account id this state owns, or `undefined` when there is no cloud identity. */
export function accountIdOf(state: AccountSessionState): string | undefined {
  return state.kind === 'anonymous' || state.kind === 'linking' || state.kind === 'linked' ? state.accountId : undefined;
}

/**
 * Whether cloud storage is usable at all in this state.
 *
 * `signing-in` is false: there is no identity yet, so a cloud read would be
 * unauthenticated. `linking` is true: the account is the same one it was
 * before the attempt started, and #34 requires that an in-flight upgrade never
 * blocks play or hides the prisons that account already owns.
 */
export function hasCloudIdentity(state: AccountSessionState): boolean {
  return accountIdOf(state) !== undefined;
}
