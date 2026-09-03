import { resolveSameOriginIngestPath } from '../services/telemetry/ingestion-config';

/**
 * Which path, if any, the Worker answers -- resolved from its environment
 * bindings and from nothing else.
 *
 * ## Absent is the default, here as on the client
 *
 * `src/services/telemetry/ingestion-config.ts` makes the browser construct
 * *nothing* when no destination is configured: no transport, no sink, no
 * session id, no consent prompt. This is the same rule stated for the
 * receiving half. With `LOCKSTATE_TELEMETRY_INGEST_PATH` unset -- which is
 * every environment in `wrangler.jsonc` and every workflow in
 * `.github/workflows/` -- there is no ingest route at all: not a disabled one,
 * not one that answers a refusal, nothing. Every request falls through to
 * Static Assets exactly as it did before a `main` existed.
 *
 * That is what makes the merge of the entry point separable from the decision
 * to run an ingest. The two halves are configured independently and both
 * default to absent, so a build can carry the code and answer nothing.
 *
 * ## Why the Worker holds the path rather than `wrangler.jsonc`
 *
 * A path in `wrangler.jsonc` would be a deployment decision committed to this
 * repository, which is the thing `sink.ts` has refused from the beginning:
 * *"an ingestion endpoint is a deployment decision, and inventing one here
 * would ship a URL nobody reviewed."* An environment binding is set where the
 * rest of the deployment configuration is set, and read here.
 *
 * The obligation that comes with it: the **same** path has to be given to the
 * client build as `LOCKSTATE_TELEMETRY_INGEST_PATH` and to the Worker as this
 * binding. They are validated against one regex
 * (`resolveSameOriginIngestPath`) so they cannot disagree about what is legal,
 * but nothing can make them agree about the *value* -- a mismatch means the
 * client posts to a path this Worker does not claim, Static Assets answers the
 * SPA shell with `200`, and the sink counts every dropped batch as delivered.
 * `docs/TELEMETRY.md` and `docs/DEPLOYMENT.md` both say so.
 *
 * ## It cannot throw
 *
 * `assets.run_worker_first` is `true`, so this resolution runs in front of
 * every request to the domain including the SPA shell. A throw here would be
 * the whole site down, which is exactly the rollback hazard
 * `docs/DEPLOYMENT.md`'s checklist item 7 names. So it takes `unknown`, coerces
 * nothing, and answers `undefined` for anything that is not a string naming a
 * legal same-origin path -- including a binding that arrives as an object, a
 * number, or an absolute URL somebody pasted.
 */
export interface TelemetryIngestRouteEnv {
  readonly LOCKSTATE_TELEMETRY_INGEST_PATH?: unknown;
}

export function resolveTelemetryIngestRoute(env: TelemetryIngestRouteEnv): string | undefined {
  const raw = env.LOCKSTATE_TELEMETRY_INGEST_PATH;
  if (typeof raw !== 'string') return undefined;
  const resolved = resolveSameOriginIngestPath(raw);
  return resolved.ok ? resolved.path : undefined;
}
