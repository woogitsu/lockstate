import { z } from 'zod';
import { admitTelemetryEnvelope } from '../services/telemetry/admission';
import type { TelemetryEnvelope, TelemetryEventRegistry } from '../services/telemetry/events';
import {
  TELEMETRY_ENVIRONMENTS,
  type TelemetryEnvironment,
} from '../services/telemetry/ingestion-config';

/**
 * Admission control for the telemetry ingest. Everything a request has to
 * survive before any of it is written down.
 *
 * The threat model for the whole surface is in `./index.ts`, which is the
 * module a reader of `wrangler.jsonc` arrives at. This file is the mechanism:
 * one function, no I/O of its own, no globals, no clock it did not receive, so
 * every guard below is exercisable from `pnpm test` in a Node process rather
 * than only against a deployed Worker.
 *
 * ## What is checked, in the order it is checked, and why that order
 *
 * The ordering is by cost, cheapest first, because every check below the line
 * an attacker fails is work they got for free.
 *
 * 1. **Method.** `POST` only. Anything else is `405` with an `Allow` header
 *    and never falls through to Static Assets -- a `GET` on this path must not
 *    answer with the SPA shell, because a route that answers `200` to a read
 *    is a route somebody will eventually try to read something out of.
 * 2. **Content type.** `application/json` only, and this is a *security*
 *    check rather than a formality: `application/json` is not a CORS
 *    simple-request media type, so a cross-origin page cannot send one without
 *    a preflight, and this Worker answers no `OPTIONS`. That is what stops a
 *    page on another origin from posting here with the visitor's browser. It
 *    does not stop `curl`, and it is not meant to.
 * 3. **Destination.** With no destination configured the request body is never
 *    read at all. See `TelemetryIngestStore` below for why there is no
 *    destination today and what lands with one.
 * 4. **Body size**, against the declared `Content-Length` *and* against the
 *    bytes actually delivered, because a chunked request may declare nothing
 *    or declare a lie.
 * 5. **UTF-8**, decoded strictly. Invalid bytes are a refusal rather than a
 *    field full of replacement characters: coercing here would mean storing a
 *    value nobody sent.
 * 6. **JSON**, then the wire schema, `.strict()`, so an unexpected field is a
 *    refusal and not a field quietly dropped.
 * 7. **Batch length.**
 * 8. **Every envelope**, through the same `admitTelemetryEnvelope` the browser
 *    sink uses -- schema, registration, category agreement, redaction fixed
 *    point.
 * 9. **Storability**, which the shared schema cannot cover; see
 *    `UNSTORABLE_TEXT` below.
 * 10. **Environment agreement** between the batch and each envelope's release
 *     identity.
 *
 * ## Reject, never coerce, never partially accept
 *
 * One bad envelope refuses the whole batch. There is no best-effort mode, no
 * truncation and no dropping of the offending event, for the same reason
 * `redactAttributes` is a fixed-point *check* on this side rather than a
 * transformation: a receiver that repairs its input is a receiver whose stored
 * rows are its own guesses. The client already drops what it cannot send
 * (`BatchingTelemetrySink.flush`), so a refused batch costs a bounded number
 * of aggregate events and nothing else.
 *
 * ## What comes back
 *
 * A refusal is one machine-readable code and nothing else. **No part of the
 * request is echoed**, no schema issue text, no field name, no index, no
 * count of what failed. Two reasons: `HttpTelemetryTransport` reads the status
 * and deliberately never reads the body (*"a response body from an endpoint
 * this client does not control has no business being read"*), so detail here
 * would serve nobody who is not holding a terminal; and an endpoint that
 * reflects its input is an endpoint that can be aimed at somebody else's
 * browser. The codes themselves are not player-visible copy -- nothing
 * renders them, and the client cannot read them.
 *
 * ## What is deliberately NOT checked
 *
 * **Consent.** A consent decision lives in the browser's key/value store, and
 * the Worker cannot see it; the envelope's `consentVersion` is the client's
 * claim about its own state and re-checking a claim against itself proves
 * nothing. So `admitTelemetryEnvelope` is called with no `allows` predicate,
 * which is the only way to omit that check -- there is no gate object here
 * that could be built to answer `true` to everything. This is a real limit and
 * it is the reason consent has to be enforced where it can be, at the sink.
 *
 * **Sampling.** As on the client, the applied rate legitimately differs from
 * the registry default. What changes here is that the client's claimed rate is
 * never a *weight*: `registrySampleRate` on the accepted record comes from the
 * receiver's own copy of the registry, and `claimedSampleRate` is carried
 * beside it as a claim to compare against
 * ([ADR 0046](../../docs/adr/0046-shipping-the-telemetry-pipeline.md) §7 item
 * 7, [ADR 0008](../../docs/adr/0008-trusted-service-boundary.md)'s 2026-08-27
 * amendment part 4).
 *
 * **The client's `occurredAt`.** Carried as `claimedOccurredAt` and keyed on
 * by nothing. `receivedAt` is stamped here, from the injected clock, and is
 * the only time value a retention window may use (same two references).
 * Bounding `occurredAt` in the shared schema would constrain only senders that
 * run this client, and the sender this rule is about does not.
 */

/**
 * The largest batch this endpoint accepts.
 *
 * `BatchingTelemetrySink`'s own default is 20 (`DEFAULT_MAX_BATCH_SIZE`) and
 * that is an *option*, so pinning the server to 20 would make a client
 * configured with a larger batch fail against a correct endpoint. 32 leaves
 * that headroom and stays small enough that the per-envelope work below is
 * bounded by something a reader can hold in their head. It is not derived from
 * the client and must not be: the client is not trusted to rate-limit itself
 * ([ADR 0046](../../docs/adr/0046-shipping-the-telemetry-pipeline.md) §7 item
 * 5).
 */
export const MAX_INGEST_BATCH_SIZE = 32;

/**
 * The byte budget one envelope is allowed to serialise into.
 *
 * Derived from the shared schema rather than chosen: `identifierSchema` caps
 * every identifier at 128 characters, `telemetryAttributeValueSchema` caps a
 * string value at `MAX_TELEMETRY_STRING_LENGTH` (200), and an envelope carries
 * at most `MAX_TELEMETRY_ATTRIBUTES` (24) of them plus nine fixed fields. The
 * worst case the schema admits is a little under 9 KiB;
 * `tests/unit/worker-telemetry-ingest.test.ts` builds that worst case from
 * those constants and asserts it fits, so raising a cap in `events.ts` without
 * raising this one fails a test rather than silently refusing legitimate
 * crash reports.
 */
export const MAX_ENVELOPE_BYTES = 12 * 1024;

/** Batch budget plus a kilobyte for the object around it. */
export const MAX_INGEST_BODY_BYTES = MAX_INGEST_BATCH_SIZE * MAX_ENVELOPE_BYTES + 1024;

export type TelemetryIngestRefusal =
  /** Not a `POST`. */
  | 'method-not-allowed'
  /** Not `application/json`. */
  | 'unsupported-media-type'
  /** Configured to answer this path, with nowhere to write what it accepts. */
  | 'destination-unconfigured'
  /** Declared or delivered more bytes than `MAX_INGEST_BODY_BYTES`. */
  | 'body-too-large'
  /** Not valid UTF-8, or not valid JSON. */
  | 'malformed-body'
  /** Valid JSON that is not the wire shape: a missing field, a wrong type, an unexpected field. */
  | 'schema-refused'
  /** More than `MAX_INGEST_BATCH_SIZE` events. */
  | 'batch-too-large'
  /** An event the registry does not carry. */
  | 'unknown-event'
  /** A registered name wearing a category the registry does not give it. */
  | 'category-mismatch'
  /** Attributes that never went through `redactAttributes`. */
  | 'unredacted'
  /** Text the destination could not store even if it wanted to. */
  | 'unstorable-text'
  /** The batch and an envelope disagree about which environment they came from. */
  | 'environment-mismatch'
  /** The destination refused. Nothing about it reaches the caller. */
  | 'store-failed';

/**
 * A validated envelope, with the two values the *server* decides attached and
 * the two the client merely claims renamed to say so.
 *
 * The names are the point. A column called `occurred_at` invites a retention
 * job to key on it, which is the defect
 * [ADR 0046](../../docs/adr/0046-shipping-the-telemetry-pipeline.md) §7 item 1
 * corrects in its own text; a field called `claimedOccurredAt` does not.
 */
export interface TelemetryIngestRecord {
  /**
   * Stamped here, from the injected clock. The only time value a retention
   * window may key on, and one a replay cannot set.
   */
  readonly receivedAt: number;
  readonly environment: TelemetryEnvironment;
  /** From the receiver's own registry, keyed by `(schemaVersion, name)`. Never the caller's. */
  readonly registrySampleRate: number;
  /** The caller's claim. A signal that a build is stale or an override is wrong; never a weight. */
  readonly claimedSampleRate: number;
  /** The caller's claim. Stored, if at all, as an untrusted attribute; keyed on by nothing. */
  readonly claimedOccurredAt: number;
  readonly envelope: TelemetryEnvelope;
}

/**
 * Where accepted records go.
 *
 * **Nothing implements this today, and the entry point passes `undefined`.**
 * That is not an oversight and it is not a parked tier: the destination is a
 * `telemetry_events` table, a `SECURITY DEFINER` insert function and a
 * dedicated least-privilege database role, all of which live under
 * `supabase/migrations/` -- which `AGENTS.md` reserves to the repository owner
 * because an applied migration is history. The SQL is written out in the pull
 * request that adds this file.
 *
 * So this endpoint accepts nothing, in the strongest sense available: with the
 * destination absent it refuses before it reads a request body
 * (`destination-unconfigured`, guard 3 above), which is a stricter posture
 * than validating and discarding and a much stricter one than answering `202`
 * to a batch it dropped. The client treats a non-2xx as a failed batch and
 * drops it silently, so no player sees anything either way.
 *
 * What lands with the migration is one implementation of this interface and
 * one line in `./index.ts` that constructs it. Nothing else here changes:
 * every guard above is already the guard the stored row will have passed.
 */
export interface TelemetryIngestStore {
  store(records: readonly TelemetryIngestRecord[]): Promise<void>;
}

export interface TelemetryIngestOptions {
  /** `undefined` until a destination exists. See `TelemetryIngestStore`. */
  readonly store: TelemetryIngestStore | undefined;
  /** Injected so `receivedAt` is testable and so this module holds no clock of its own. */
  readonly now?: (() => number) | undefined;
  readonly registry?: TelemetryEventRegistry | undefined;
}

/**
 * The wire shape `HttpTelemetryTransport` posts:
 * `{ environment, events: TelemetryEnvelope[] }`.
 *
 * `events` is `unknown[]` here on purpose. Each element is validated by
 * `admitTelemetryEnvelope`, which is the same function the browser sink uses,
 * so there is exactly one definition of what an envelope is and this schema
 * does not become a second one that can drift from it. The length bound is
 * applied separately so that an over-long batch reports `batch-too-large`
 * rather than being folded into a generic schema refusal -- a flood and a
 * malformed client are different operational facts.
 */
export const telemetryIngestBodySchema = z
  .object({
    environment: z.enum(TELEMETRY_ENVIRONMENTS),
    events: z.array(z.unknown()),
  })
  .strict();

/**
 * Text no destination can hold, whatever it is.
 *
 * Two shapes, and each is a *storability* fact rather than a taste:
 *
 * - **`U+0000`.** PostgreSQL `text` and `jsonb` cannot represent it; an insert
 *   carrying one errors. `telemetryAttributeValueSchema` is
 *   `z.string().max(200)` and admits it, so the shared schema cannot be where
 *   this is caught -- and it must not be widened to catch it, because a
 *   client-side bound constrains only senders that run this client.
 * - **A lone surrogate.** `TextDecoder` with `fatal: true` rejects invalid
 *   UTF-8 bytes, but `"\ud800"` is a *valid* JSON escape that decodes to an
 *   unpaired surrogate, which is not representable as UTF-8 at all.
 *
 * Newlines, tabs and every other control character are deliberately admitted:
 * an `errorMessage` may legitimately contain one, and this Worker writes
 * nothing to a log, so there is no log line for one to forge.
 */
const UNSTORABLE_TEXT = /\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;

const REFUSAL_STATUS: Readonly<Record<TelemetryIngestRefusal, number>> = {
  'method-not-allowed': 405,
  'unsupported-media-type': 415,
  'destination-unconfigured': 503,
  'body-too-large': 413,
  'malformed-body': 400,
  'schema-refused': 400,
  'batch-too-large': 413,
  'unknown-event': 400,
  'category-mismatch': 400,
  unredacted: 400,
  'unstorable-text': 400,
  'environment-mismatch': 400,
  'store-failed': 502,
};

/**
 * Headers every response from this endpoint carries.
 *
 * `public/_headers` is applied by Static Assets and reaches nothing the Worker
 * writes itself, so these are stated here or they are absent. `nosniff` and
 * `no-store` are the two that matter for a JSON body; there is deliberately no
 * `Access-Control-Allow-Origin`, which is what keeps a cross-origin page from
 * reading anything this route says.
 */
const RESPONSE_HEADERS: Readonly<Record<string, string>> = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

export function telemetryIngestRefusal(reason: TelemetryIngestRefusal): Response {
  const headers: Record<string, string> = { ...RESPONSE_HEADERS };
  if (reason === 'method-not-allowed') headers['allow'] = 'POST';
  return new Response(`{"error":${JSON.stringify(reason)}}`, {
    status: REFUSAL_STATUS[reason],
    headers,
  });
}

function accepted(count: number): Response {
  return new Response(`{"accepted":${count}}`, { status: 202, headers: { ...RESPONSE_HEADERS } });
}

function isJsonContentType(value: string | null): boolean {
  if (value === null) return false;
  // Parameters are allowed (`; charset=utf-8`), a different media type is not.
  const mediaType = value.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return mediaType === 'application/json';
}

type BoundedBody = { readonly ok: true; readonly text: string } | { readonly ok: false; readonly reason: 'body-too-large' | 'malformed-body' };

/**
 * Reads at most `MAX_INGEST_BODY_BYTES` and refuses rather than truncating.
 *
 * The declared `Content-Length` is checked first because it is free, and the
 * delivered bytes are counted anyway because a chunked request declares
 * nothing and a hostile one may declare anything. Cloudflare's own request
 * limit is orders of magnitude above this bound, so it is not the guard.
 */
async function readBoundedBody(request: Request, maxBytes: number): Promise<BoundedBody> {
  const declared = request.headers.get('content-length');
  if (declared !== null) {
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length < 0) return { ok: false, reason: 'malformed-body' };
    if (length > maxBytes) return { ok: false, reason: 'body-too-large' };
  }

  const body = request.body;
  if (body === null) return { ok: true, text: '' };

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    const value = chunk.value;
    if (value === undefined) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { ok: false, reason: 'body-too-large' };
    }
    chunks.push(value);
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    // `fatal`, so invalid UTF-8 is a refusal. The lenient decoder substitutes
    // U+FFFD, which would mean storing characters nobody sent.
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(joined) };
  } catch {
    return { ok: false, reason: 'malformed-body' };
  }
}

function hasUnstorableText(envelope: TelemetryEnvelope): boolean {
  // Only attribute *values* are free text. Every identifier on the envelope --
  // the name, the ids, the build version -- is constrained by
  // `identifierSchema`'s character class, which admits neither shape.
  for (const value of Object.values(envelope.attributes)) {
    if (typeof value === 'string' && UNSTORABLE_TEXT.test(value)) return true;
  }
  return false;
}

/**
 * The whole endpoint, as a function of a request.
 *
 * Takes and returns web platform types only, holds no state between calls,
 * reads no global, and reaches the network through nothing but the injected
 * store. There is no branch in it that depends on who is asking: it makes no
 * lookup, resolves no identity, and reads no header other than the method and
 * the content type -- so two requests differing only in what they claim about
 * a prison, an account or a session get byte-identical answers, because there
 * is no code here that could tell them apart.
 */
export async function handleTelemetryIngest(
  request: Request,
  options: TelemetryIngestOptions,
): Promise<Response> {
  if (request.method !== 'POST') return telemetryIngestRefusal('method-not-allowed');
  if (!isJsonContentType(request.headers.get('content-type'))) {
    return telemetryIngestRefusal('unsupported-media-type');
  }
  // Before the body is touched. An ingest with nowhere to write is not a
  // bandwidth or a CPU surface at all, which is a stronger property than
  // validating and then discarding.
  if (options.store === undefined) return telemetryIngestRefusal('destination-unconfigured');

  const body = await readBoundedBody(request, MAX_INGEST_BODY_BYTES);
  if (!body.ok) return telemetryIngestRefusal(body.reason);

  let json: unknown;
  try {
    json = JSON.parse(body.text);
  } catch {
    return telemetryIngestRefusal('malformed-body');
  }

  const parsed = telemetryIngestBodySchema.safeParse(json);
  if (!parsed.success) return telemetryIngestRefusal('schema-refused');
  if (parsed.data.events.length === 0) return telemetryIngestRefusal('schema-refused');
  if (parsed.data.events.length > MAX_INGEST_BATCH_SIZE) return telemetryIngestRefusal('batch-too-large');

  const receivedAt = (options.now ?? Date.now)();
  const records: TelemetryIngestRecord[] = [];

  for (const candidate of parsed.data.events) {
    const verdict = admitTelemetryEnvelope(
      candidate,
      options.registry === undefined ? {} : { registry: options.registry },
    );
    if (!verdict.admitted) {
      // `no-consent` is unreachable: no `allows` predicate was supplied, so
      // `admitTelemetryEnvelope` cannot take that branch. Mapped to
      // `schema-refused` rather than left to fall through, so that adding a
      // consent check here later cannot produce an undefined status.
      return telemetryIngestRefusal(
        verdict.reason === 'invalid-envelope' || verdict.reason === 'no-consent'
          ? 'schema-refused'
          : verdict.reason,
      );
    }
    if (hasUnstorableText(verdict.envelope)) return telemetryIngestRefusal('unstorable-text');
    // The wire body and the envelope both state the environment. A body where
    // they disagree has no single right answer to store, and picking one would
    // be the receiver guessing.
    if (verdict.envelope.release.environment !== parsed.data.environment) {
      return telemetryIngestRefusal('environment-mismatch');
    }

    records.push({
      receivedAt,
      environment: parsed.data.environment,
      registrySampleRate: verdict.definition.sampleRate,
      claimedSampleRate: verdict.envelope.sampleRate,
      claimedOccurredAt: verdict.envelope.occurredAt,
      envelope: verdict.envelope,
    });
  }

  try {
    await options.store.store(records);
  } catch {
    // The status and nothing else. Whatever the destination said about itself
    // is not the caller's business, and it is not written to a log either --
    // see `./index.ts` on why this Worker logs nothing at all.
    return telemetryIngestRefusal('store-failed');
  }

  return accepted(records.length);
}
