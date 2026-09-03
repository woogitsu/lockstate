import { handleTelemetryIngest, telemetryIngestRefusal, type TelemetryIngestStore } from './telemetry-ingest';
import { resolveTelemetryIngestRoute, type TelemetryIngestRouteEnv } from './telemetry-ingest-route';

/**
 * The first code in this project that runs where a player cannot see it.
 *
 * `wrangler.jsonc` names this module as `main`, so it is the fetch handler in
 * front of `lockstate.io`. Everything above the ingest route is Static Assets
 * behaving exactly as it did before this file existed; the ingest route is the
 * telemetry endpoint [ADR 0046](../../docs/adr/0046-shipping-the-telemetry-pipeline.md)
 * needs and the only thing this Worker adds.
 *
 * `docs/DEPLOYMENT.md`, "The first server entry point lands with the ingest,
 * not before", is the owner's decision that put it here and the nine-item
 * checklist it has to satisfy. `AGENTS.md` records the release of the
 * reservation that used to forbid it.
 *
 * ## What it claims, and what happens to everything else
 *
 * `assets.run_worker_first` is `true` in every environment, so this handler
 * sees **every** request to the domain -- `/`, every deep link, every
 * fingerprinted `/assets/*` file. It has to be `true`:
 * `assets.not_found_handling` is `single-page-application`, which makes the
 * asset router match every path it is asked about, so with the default
 * assets-first routing a Worker would never be reached at all.
 *
 * Exactly one path is claimed, and only when a deployment names it: the value
 * of the `LOCKSTATE_TELEMETRY_INGEST_PATH` binding, validated by
 * `./telemetry-ingest-route`. **With that binding unset -- which is every
 * environment in `wrangler.jsonc` today -- no path is claimed and every
 * request is handed to `env.ASSETS` unchanged.** `not_found_handling` stays
 * `single-page-application`, `public/_headers` still decides the headers on
 * every asset response because those responses still come from Static Assets,
 * and `dist/.assetsignore` still keeps the generated Wrangler config off the
 * origin. Nothing about the site changes; that is the point of the shape.
 *
 * A request on the claimed path is answered here and never falls through, in
 * either direction: a `GET` gets `405`, not the SPA shell.
 *
 * ## THREAT MODEL
 *
 * The ingest is **unauthenticated by design**, which is the whole reason this
 * paragraph exists. Telemetry carries no account identifier
 * ([ADR 0010](../../docs/adr/0010-telemetry-and-diagnostics-privacy.md)) and
 * requiring a JWT would attach the identity that design spent itself avoiding.
 * [ADR 0008](../../docs/adr/0008-trusted-service-boundary.md)'s amendment of
 * 2026-08-27 settles that this is permitted -- §3 binds mutation paths over
 * state its §2 table assigns to Z2, an ingest decides nothing (it records what
 * an untrusted source said), so the path is outside §3 and needs no exception
 * -- and adds threat **T13** for the price: *"flooded, forged or back-dated
 * events posted to an unauthenticated telemetry ingest"*, by *"anyone who can
 * reach the endpoint, with no account and no credential"*.
 *
 * **What an attacker can send.** Anything at all: any method, any headers, any
 * body, at any rate, from anywhere, with no credential and nothing to revoke.
 * A batch of forged crash reports naming a build that never shipped. A body
 * that declares one length and delivers another. A hundred megabytes. A
 * `sampleRate` of `0` so that a receiver dividing by it counts one event as
 * infinitely many. An `occurredAt` in the year 4000 so the row never falls out
 * of a retention window keyed on it. Attributes carrying an email address, a
 * prison name, a null byte or an unpaired surrogate. An event name the
 * registry has never heard of, or a real name relabelled into another
 * category.
 *
 * **What each guard stops.** In `./telemetry-ingest`, in the order applied:
 *
 * | Guard | What it stops |
 * | --- | --- |
 * | `POST` only, `405` otherwise | The route being read. There is no `GET`, no `HEAD` and no `OPTIONS` answer here, so nothing can be retrieved from it and no cross-origin preflight can succeed |
 * | `application/json` only | A cross-origin *page* posting with a visitor's browser. `application/json` is not a CORS simple type, so it requires a preflight this Worker never answers, and no `Access-Control-Allow-Origin` is ever sent |
 * | Destination required first | Every guard below being reachable at all while there is nowhere to store. With no destination the request body is not read: no bandwidth, no parse, no allocation |
 * | Declared and delivered byte caps | Memory exhaustion from one request, and a body that lies about its length. `MAX_INGEST_BODY_BYTES` is derived from the envelope schema's own caps, not chosen |
 * | Strict UTF-8 decode | Storing replacement characters nobody sent |
 * | `JSON.parse`, then a `.strict()` wire schema | A body that is nearly right. An unexpected field is a refusal, never a field silently dropped -- which is what would let a future column be populated by something nobody declared |
 * | Batch length cap | A single request carrying an unbounded number of events |
 * | `admitTelemetryEnvelope`, per envelope | A forged envelope. It is the *same function the browser sink calls*: envelope schema, the name being in the registry, the category being the one the registry declares for that name, and the attributes already being a fixed point of `redactAttributes`. Not a second copy of those checks -- a server-side check that drifts from the client-side one is a check nobody runs |
 * | Unstorable-text check | A null byte or a lone surrogate, neither of which PostgreSQL `text` or `jsonb` can hold, and neither of which the shared schema can be widened to catch without pretending a client-side bound constrains a caller who is not running this client |
 * | Environment agreement | A batch whose two statements of its own environment disagree, which has no single right answer to store |
 * | `receivedAt` stamped here | Retention evasion. The stored time is the server's, from the injected clock; the caller's is carried as `claimedOccurredAt` and keyed on by nothing |
 * | `registrySampleRate` taken from the registry | Aggregate amplification. `1 / sampleRate` with a caller-chosen denominator is an unbounded multiplier; the receiver's own registry row is the rate, and the caller's is a claim to compare against |
 * | Whole-batch rejection | A partially-stored batch, and a receiver that repairs its input |
 * | One code back, no echo | The response being a reflector. Nothing from the request appears in it -- no field name, no index, no schema message |
 *
 * **What is deliberately still possible.** Naming it is the honest half:
 *
 * - **Flooding.** There is no per-caller rate limit in this Worker. It would
 *   have to key on something, and the only thing available is the caller's IP,
 *   which ADR 0046 §7 item 2 forbids retaining -- so a limiter here would
 *   either retain what it must not or key on a value the caller chooses.
 *   Cloudflare's own edge limits and the byte and batch caps above are what
 *   bound the damage; the caps make one request cheap to refuse, not
 *   impossible to send. Rate limiting belongs at the edge, in configuration,
 *   which is the owner's.
 * - **Forgery.** A well-formed batch of events that never happened is
 *   accepted, because "well-formed" is all an unauthenticated ingest can
 *   check. What that costs is diagnostic signal, and the mitigations are the
 *   ones that stop forgery from becoming *leverage*: the registry decides the
 *   sample rate, the server decides the time, and nothing is weighted by a
 *   value the caller sent.
 * - **Replay.** The same batch posted twice is accepted twice. The client's
 *   `eventId` is `${sessionId}-${counter}` and is a natural idempotency key,
 *   but deduplicating on it belongs in the destination's schema -- a unique
 *   constraint the insert collides with -- not in a stateless handler that
 *   would need somewhere to remember what it had seen. ADR 0046's proposed
 *   migration content keys the table on `event_id` for exactly this.
 * - **Reading the site.** Nothing here restricts what Static Assets serves,
 *   because nothing here should. This Worker adds a route; it is not a
 *   gateway.
 *
 * ## No authorisation decision, and therefore no oracle
 *
 * There is no authorisation decision on this path because there is nothing to
 * authorise: an accepted record carries no account id, no prison id and no
 * user-supplied identity of any kind. `TelemetryIngestRecord` has no field for
 * one, and ADR 0046's proposed table has no `user_id` column, so the *direct*
 * join is structurally absent rather than merely forbidden.
 *
 * The consequence for the class of defect PR #355 and issues #340/#342/#343
 * are about: **this endpoint cannot be a prison-id oracle, because it has no
 * branch that reads one.** It performs no lookup, resolves no identity and
 * reads no header beyond the method and the content type. Two requests
 * differing only in what they claim about a prison -- one that exists, one
 * that does not, one that belongs to somebody else -- get byte-identical
 * answers, and they get them for the strongest available reason: not because
 * two branches were carefully worded to match, but because there is only one
 * branch. `tests/unit/worker-telemetry-ingest.test.ts` asserts the identity of
 * those responses anyway, so a future branch that started distinguishing them
 * would fail rather than be noticed.
 *
 * ## It logs nothing
 *
 * No `console` call anywhere in this module or the two beside it, and
 * `tests/unit/worker-telemetry-ingest.test.ts` asserts that. Every request to
 * this Worker carries the visitor's IP address, and an IP is personal data
 * this design collects nowhere else -- ADR 0046 §7 item 2 says the endpoint
 * must neither log it nor persist it. A `console.log(request.url)` in a
 * Cloudflare Worker reaches the account's log stream with the request metadata
 * attached, so the only reliable way not to build an access log is not to
 * write to it. The cost is real and is accepted: there is no server-side
 * diagnostic for this endpoint at all, and a bug in it will be diagnosed from
 * status codes.
 *
 * ## No secret is held here
 *
 * The one binding read is a path. No key, no token, no project reference and
 * no database credential appears in this file or in any file under `src/`, and
 * `scripts/check-deploy-secrets.sh` scans the built artefact for
 * credential-shaped material on the deploy path. The credential the destination
 * will need is a **dedicated least-privilege database role** and specifically
 * *not* the service role -- that role may call `record_entitlement_event`, so
 * a publicly reachable Worker holding its key would hold the paid-entitlement
 * write path (ADR 0008's amendment, part 7). It arrives with the migration
 * that creates the destination, and until then this Worker holds nothing.
 *
 * That role is written with a hyphen here rather than as the SQL identifier,
 * deliberately. `check-deploy-secrets.sh`'s bundle scan treats the
 * unhyphenated name as secret-shaped wherever it appears in an artefact, and
 * it is right to -- a comment survives into a bundle. The identifier belongs
 * in `supabase/` and in `docs/DEPLOYMENT.md`, which that scan does not read.
 * `tests/unit/worker-telemetry-ingest.test.ts` runs the scan over this
 * directory, so the rule is enforced rather than remembered.
 *
 * ## Rollback
 *
 * A bad static asset serves a stale page; a `main` that throws serves nothing
 * at all, on a domain whose binding is not reproducible from this repository.
 * Three things stand between a defect here and that outcome. Route resolution
 * cannot throw (`./telemetry-ingest-route`). The ingest is wrapped, so a
 * throw inside it is one `500` on one path rather than an unhandled rejection.
 * And the fall-through is the last statement in the function, reached by every
 * request that is not on the claimed path, so no code above it can fail to
 * return. Reverting is reverting the commit that added `main`; the deploy that
 * follows publishes an assets-only Worker again.
 */

export interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

export interface LockstateWorkerEnv extends TelemetryIngestRouteEnv {
  readonly ASSETS: AssetsBinding;
}

export interface LockstateWorkerOptions {
  /**
   * Where accepted records go. `undefined` in the shipped Worker below, and
   * `./telemetry-ingest` says why: the destination is a table, an insert
   * function and a dedicated database role under `supabase/migrations/`, which
   * is the owner's.
   */
  readonly store: TelemetryIngestStore | undefined;
}

/**
 * The handler, as a function of its one dependency.
 *
 * A factory rather than a bare object literal for the reason the composition
 * root contract exists: the shipped wiring is one call at the bottom of this
 * file, and every branch above -- the fall-through, the method refusal, the
 * `catch` -- is reachable from a test with a store the shipped Worker does not
 * have. Without it the `catch` would be unreachable by construction, which is
 * the same thing as untested.
 */
export function createLockstateWorker(options: LockstateWorkerOptions): {
  fetch(request: Request, env: LockstateWorkerEnv): Promise<Response>;
} {
  return {
    async fetch(request: Request, env: LockstateWorkerEnv): Promise<Response> {
      const ingestPath = resolveTelemetryIngestRoute(env);

      if (ingestPath !== undefined && new URL(request.url).pathname === ingestPath) {
        try {
          return await handleTelemetryIngest(request, { store: options.store });
        } catch {
          // A defect in the handler is one status code on one path. It is not
          // a log line (see above), it is not a message, and it is
          // emphatically not a fall-through to Static Assets: answering the
          // SPA shell with `200` would tell the client the batch was
          // delivered.
          return telemetryIngestRefusal('store-failed');
        }
      }

      return env.ASSETS.fetch(request);
    },
  };
}

export default createLockstateWorker({ store: undefined });
