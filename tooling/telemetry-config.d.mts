/**
 * Types for the telemetry ingestion resolvers, in the shape
 * `build-identity.d.mts` established for the same reason: `vite.config.ts` is
 * type-checked, and an untyped `.mjs` import is an implicit `any` under
 * `noImplicitAny`.
 *
 * The reading half is `src/services/telemetry/ingestion-config.ts`, which is
 * where every rule about what a valid destination is actually lives. Nothing
 * here validates anything.
 */

/** A root-relative path such as `/api/telemetry`, or `''` when unset. Never a URL. */
export function telemetryIngestPath(): string;

/** `development`, `staging` or `production`, or `''` when unset. Not validated here. */
export function telemetryEnvironment(): string;

/**
 * The `define` entries `vite.config.ts` passes through, already JSON-quoted.
 * Both are `'""'` unless a deployment sets the corresponding variable, which
 * nothing in this repository does.
 */
export function telemetryDefines(): Readonly<Record<string, string>>;
