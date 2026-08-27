import { z } from 'zod';
import { MigrationChain } from '../../persistence/migration';
import { zodVersionSchema } from '../../persistence/zod-version-schema';
import type { KeyValueStore } from '../../shared/key-value-store';

/**
 * The small, durable part of "how does this player want to use an account".
 *
 * Everything else about a session is owned by the auth SDK and rebuilt on
 * launch; what cannot be rebuilt is a *choice*. Without this, a player who
 * declined cloud save is asked again on every load, and #34's first criterion
 * -- "a new user can create/play/save locally without registration" -- degrades
 * into a prompt they have to dismiss for ever.
 *
 * `AGENTS.md` boundary 7: every persistent format has a version and a
 * migration strategy before release. This one goes through the same
 * `MigrationChain` the save envelope uses rather than a bespoke `if (v === 1)`
 * -- there is one version today and the seam for the second is the point.
 *
 * **`.strict()` is load-bearing, not tidiness.** A stored blob carrying an
 * `accessToken` -- put there by an older build, a browser extension, or a
 * future contributor who thought this was a convenient place for one -- fails
 * to parse and is discarded, so a credential can never be read back out of
 * here and travel onward into a diagnostic dump or a save (#34, Out of scope).
 */
export const ACCOUNT_PREFERENCES_VERSION = 1 as const;

const accountPreferencesV1Schema = z
  .object({
    version: z.literal(ACCOUNT_PREFERENCES_VERSION),
    /** Whether the player has asked for cloud save at all. `false` is a real answer, not "not yet asked". */
    cloudSaveOptIn: z.boolean(),
    /** Whether they have been shown the local-only explanation, so it is offered once rather than every launch. */
    cloudSaveOfferSeen: z.boolean(),
    /**
     * The last account id this device signed in as.
     *
     * An opaque `auth.users` uuid and never a credential: it is exactly what
     * `loadCachedEntitlementProjection` already keys its cache on, and it is
     * what lets a returning player be told which account their cloud prisons
     * belong to before the network answers.
     */
    lastAccountId: z.string().min(1).max(128).optional(),
  })
  .strict();

export type AccountPreferences = z.infer<typeof accountPreferencesV1Schema>;

export const DEFAULT_ACCOUNT_PREFERENCES: AccountPreferences = {
  version: ACCOUNT_PREFERENCES_VERSION,
  cloudSaveOptIn: false,
  cloudSaveOfferSeen: false,
};

const accountPreferencesMigrations = new MigrationChain(ACCOUNT_PREFERENCES_VERSION);
accountPreferencesMigrations.registerSchema(zodVersionSchema(ACCOUNT_PREFERENCES_VERSION, accountPreferencesV1Schema));

const STORAGE_KEY = 'lockstate.account.preferences';

/**
 * Reads the stored preferences, or the defaults.
 *
 * Every failure mode lands on the defaults -- absent, empty, unparseable JSON,
 * a version this build does not know, a schema violation, an unknown key. The
 * degradation is always towards *local-only with nothing opted into*, which is
 * the state that needs no server and destroys nothing.
 */
export function loadAccountPreferences(store: KeyValueStore): AccountPreferences {
  const raw = store.getItem(STORAGE_KEY);
  if (raw === null || raw === '') return DEFAULT_ACCOUNT_PREFERENCES;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_ACCOUNT_PREFERENCES;
  }

  // The declared version is read off the record itself, exactly as the save
  // envelope's `saveSchemaVersion` is: a record that does not say which
  // version it is cannot be migrated, and guessing "the current one" would
  // hand a future record to today's schema.
  const declared = (parsed as { readonly version?: unknown } | null)?.version;
  if (typeof declared !== 'number') return DEFAULT_ACCOUNT_PREFERENCES;

  const migrated = accountPreferencesMigrations.migrate<AccountPreferences>(parsed, declared);
  return migrated.ok ? migrated.value : DEFAULT_ACCOUNT_PREFERENCES;
}

/** Writes the preferences, re-validating on the way out so a malformed record can never be produced from inside this process either. */
export function saveAccountPreferences(store: KeyValueStore, preferences: AccountPreferences): void {
  store.setItem(STORAGE_KEY, JSON.stringify(accountPreferencesV1Schema.parse(preferences)));
}

/**
 * Called on sign-out: the account id goes, the player's *choices* stay.
 *
 * Forgetting `cloudSaveOptIn` here would re-ask a player who signed out of one
 * account whether they want cloud save at all, which is not the question they
 * answered by signing out.
 */
export function forgetAccountIdentity(preferences: AccountPreferences): AccountPreferences {
  const { lastAccountId: _forgotten, ...rest } = preferences;
  return rest;
}
