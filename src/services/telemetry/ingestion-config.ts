import type { ReleaseIdentity } from './events';

/**
 * Where telemetry goes, resolved from deployment configuration — and, by
 * default, nowhere.
 *
 * ## The rule this file exists to keep
 *
 * `sink.ts` has always said it: *"an ingestion endpoint is a deployment
 * decision, and inventing one here would ship a URL nobody reviewed."* No URL,
 * host, project reference or table name appears anywhere in `src/`. The
 * destination arrives as two compile-time strings the deployment sets, and
 * **when they are absent the resolution fails and nothing is constructed** —
 * not a disabled transport, not a no-op sink, nothing. Absent is the default,
 * and it is the state every build in this repository is in today.
 *
 * ## Why a same-origin path and not a URL
 *
 * `public/_headers` sets `connect-src 'self'`. A cross-origin destination
 * would need that directive widened, which is a security-header change
 * (ADR 0021) and a new processor relationship, and it would make the client's
 * privacy posture depend on a host nobody in this repository reviews. A
 * root-relative path is the only shape that leaves the header untouched, and
 * refusing anything else here is what makes "no `_headers` change was needed"
 * a checked fact rather than a claim: a deployment that sets an
 * `https://…` destination gets `not-same-origin` and sends nothing, instead
 * of silently emitting requests the browser then blocks.
 *
 * The corresponding obligation is on the deployment, and it is real: the path
 * has to be served by something. Under the current `wrangler.jsonc` the site
 * is Static Assets with no Worker script, so **no route answers any path
 * today** and the configuration is unsettable in practice until one exists.
 * That is deliberately not fixed here — it is the owner's decision, recorded
 * with everything else it entails in the ADR.
 *
 * ## Why the environment is required rather than guessed
 *
 * `ReleaseIdentity.environment` is part of every envelope, and there is no
 * honest way to infer it in a browser: a bundle knows its commit (through
 * `src/shared/build-identity.ts`) and nothing about where it was deployed.
 * Defaulting it to `production` would mislabel every staging crash, and
 * defaulting it to `development` would hide real ones. So a deployment that
 * names a destination and no environment is refused, exactly as one that
 * names neither is.
 */

export const TELEMETRY_ENVIRONMENTS = ['development', 'staging', 'production'] as const;
export type TelemetryEnvironment = (typeof TELEMETRY_ENVIRONMENTS)[number];

export interface TelemetryIngestion {
  /** A root-relative, same-origin path. Never a URL. */
  readonly path: string;
  readonly environment: TelemetryEnvironment;
}

export type TelemetryIngestionRefusal =
  /** Nothing was configured. The default, and the state of every build in this repository. */
  | 'absent'
  /** A URL, a protocol-relative reference or anything else that would leave the origin. */
  | 'not-same-origin'
  /** Same-origin in intent but not a plain path: a query, a fragment, whitespace, traversal. */
  | 'malformed-path'
  /** A destination with no environment, or an environment that is not one of the three. */
  | 'unknown-environment';

export type TelemetryIngestionResolution =
  | { readonly configured: true; readonly ingestion: TelemetryIngestion }
  | { readonly configured: false; readonly reason: TelemetryIngestionRefusal };

export interface RawTelemetryIngestionConfig {
  readonly path?: string | undefined;
  readonly environment?: string | undefined;
}

/**
 * A single leading slash, then path segments of unreserved characters.
 *
 * No query, no fragment, no `..`, no encoded characters, no whitespace. The
 * point is not that a query would be dangerous by itself but that a
 * configuration value spliced into a request is a channel, and this one has no
 * reason to carry anything but a route.
 */
const SAME_ORIGIN_PATH = /^\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/;

function isTelemetryEnvironment(value: string): value is TelemetryEnvironment {
  return (TELEMETRY_ENVIRONMENTS as readonly string[]).includes(value);
}

export function resolveTelemetryIngestion(raw: RawTelemetryIngestionConfig): TelemetryIngestionResolution {
  const path = (raw.path ?? '').trim();
  const environment = (raw.environment ?? '').trim();

  // Absent first, and absent means the *destination* is absent: an
  // environment on its own configures nothing to send to.
  if (path === '') return { configured: false, reason: 'absent' };

  // Reported separately from `malformed-path` because it is the refusal with a
  // consequence a reader needs to see: it is the one that would have required
  // `connect-src` to be widened.
  if (path.includes('://') || path.startsWith('//')) {
    return { configured: false, reason: 'not-same-origin' };
  }
  // `.` is an unreserved character, so `..` satisfies the pattern above. A
  // traversal cannot escape an origin, but a destination that resolves
  // somewhere other than where it reads is a configuration nobody can review
  // by reading it.
  if (!SAME_ORIGIN_PATH.test(path) || path.split('/').some((segment) => segment === '.' || segment === '..')) {
    return { configured: false, reason: 'malformed-path' };
  }
  if (!isTelemetryEnvironment(environment)) return { configured: false, reason: 'unknown-environment' };

  return { configured: true, ingestion: { path, environment } };
}

/**
 * The release identity every envelope carries, assembled from the build's own
 * identity and the configured environment.
 *
 * `buildVersion` is the whole `BUILD_IDENTITY.id`, which is what
 * `SaveEnvelope.gameVersion` and the worker handshake already use, so a crash
 * report names the same build a save and a bug report do. The optional
 * `commit` is passed separately because `identifierSchema` rejects an empty
 * string and `src/shared/build-identity.ts` yields `unknown` rather than
 * nothing when a build could not read one.
 */
export function telemetryReleaseIdentity(
  buildVersion: string,
  environment: TelemetryEnvironment,
  commit?: string,
): ReleaseIdentity {
  return {
    buildVersion,
    environment,
    ...(commit === undefined || commit === '' ? {} : { commit }),
  };
}
