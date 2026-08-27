/**
 * The telemetry ingestion destination, for Vite's `define`.
 *
 * The other half is `src/services/telemetry/ingestion-config.ts`, which
 * validates whatever arrives and refuses everything that is not a
 * root-relative, same-origin path with one of three known environments. This
 * half only reads the environment and quotes it; it judges nothing, because a
 * build must not fail over a value that correctly resolves to "send nothing".
 *
 * ## Why a `define` and not `import.meta.env`
 *
 * `VITE_`-prefixed variables would be the idiomatic route, and
 * `tests/foundation/documentation-claims-contract.test.ts` refuses
 * `import.meta.env` anywhere under `src/` outside `src/persistence/cloud/` --
 * its scan for "a module outside the cloud client now reads Supabase
 * configuration" matches the expression itself. Rather than widen a gate that
 * is correct, this follows `tooling/build-identity.mjs`, which already solves
 * the same problem the same way for the build's version and commit.
 *
 * ## Nothing here is secret
 *
 * Both values are baked into a public bundle. A same-origin path is a route on
 * the site a player is already on, and the environment name is one of three
 * words. `scripts/check-deploy-secrets.sh` sweeps `VITE_`-prefixed names and
 * scans the built artefact for credential shapes; neither variable below is
 * `VITE_`-prefixed and neither carries a credential, so neither mode has
 * anything to say about them. There is deliberately no ingestion *token*
 * option: a shared secret in a public bundle is not a secret, and pretending
 * otherwise is how a `VITE_TELEMETRY_INGEST_TOKEN` -- a name that script
 * already uses as its example of the mistake -- gets added.
 *
 * ## Absent is the default and the only state in this repository
 *
 * Neither variable is set by any workflow in `.github/workflows/`, and
 * `tests/browser/vite.config.ts` deliberately does not pass these defines at
 * all, so the Playwright suite exercises the absent-configuration path -- the
 * one every shipped build is in. Setting them is a deployment act that also
 * requires a route to exist to answer the path; see the telemetry pipeline ADR
 * for what the ingestion side must do before either is set.
 */

/** A root-relative path such as `/api/telemetry`, or `''`. Never a URL. */
export function telemetryIngestPath() {
  const value = process.env['LOCKSTATE_TELEMETRY_INGEST_PATH'];
  return typeof value === 'string' ? value.trim() : '';
}

/** `development`, `staging` or `production`, or `''`. Validated in `src/`, not here. */
export function telemetryEnvironment() {
  const value = process.env['LOCKSTATE_TELEMETRY_ENVIRONMENT'];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * `JSON.stringify` because `define` substitutes the text verbatim: an unquoted
 * value would be spliced into the bundle as an expression.
 */
export function telemetryDefines() {
  return {
    __LOCKSTATE_TELEMETRY_INGEST_PATH__: JSON.stringify(telemetryIngestPath()),
    __LOCKSTATE_TELEMETRY_ENVIRONMENT__: JSON.stringify(telemetryEnvironment()),
  };
}
