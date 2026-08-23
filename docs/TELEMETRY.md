# Telemetry and crash diagnostics: privacy policy and implementation

Issue #36 requires diagnostics that are useful to engineering and
uninteresting to a privacy regulator. The decision record is
[ADR 0010](./adr/0010-telemetry-and-diagnostics-privacy.md); the
implementation is `src/services/telemetry/`, tested in
`tests/unit/services-telemetry.test.ts`.

## Principles

1. **Nothing is collected before the player says yes.** All categories
   default to off, including crash diagnostics.
2. **Collect the minimum that answers a written question.** An event exists
   only if it has a registered name, a category and a stated purpose.
3. **Redact anyway.** Redaction runs on every event, including attributes
   the caller believes are safe.
4. **Never block the game.** Recording is O(1); nothing is on the tick or
   frame path; a failed send is dropped, not retried forever.

## Consent

`TelemetryConsent` is three independent booleans plus a policy version:

| Category | What it answers |
| --- | --- |
| `diagnostics` | Is the game crashing, and where? |
| `performance` | Are tick/frame budgets holding on real hardware? |
| `gameplay` | Coarse aggregates for scenario/tutorial design. |

Consent lives in client key/value storage (the player must be able to
change it offline) and outside any prison save. Raising
`TELEMETRY_CONSENT_VERSION` invalidates a stored decision and re-asks:
consent for one policy is not consent for a wider one. Withdrawing consent
takes effect on the very next event, with no flush of what is already
queued required to make that true.

## Event schema

Every event is a `TelemetryEnvelope`, validated with Zod before it can be
enqueued:

| Field | Notes |
| --- | --- |
| `schemaVersion`, `eventId`, `name`, `category`, `occurredAt` | |
| `sessionId` | Rotating per browser session. Never persisted, never derived from the account id. |
| `release` | `buildVersion`, environment, optional commit — the source-map correlation handle. |
| `consentVersion` | Which policy the player agreed to. |
| `sampleRate` | The applied rate, so the receiver can weight rather than guess. |
| `attributes` | Scalars only; ≤ 24 entries; strings ≤ 200 characters. |

Registered events today: `diagnostic.unhandled-error`,
`diagnostic.save-decode-failed`, `diagnostic.worker-terminated`,
`performance.tick-budget`, `performance.frame-budget`,
`gameplay.scenario-completed`. An unregistered name is refused.

## Never collected by default

Save payloads or any fragment of them; prison, entity or command data;
account id or email; auth tokens; precise location; device fingerprints;
third-party advertising or session-replay SDKs (there are none, and adding
one requires an ADR plus explicit human approval).

Crash reports carry: error name, redacted message, up to 12 stack frames
reduced to `function(bundleFile:line:col)`, the release identity and the
rotating session id.

## Redaction

`redactAttributes()` drops attributes whose *key* matches a sensitive
pattern (`token`, `secret`, `password`, `auth`, `session`, `email`,
`signature`, `payload`, …) rather than blanking them in place — a key left
behind as `authToken: "[redacted]"` still leaks that a token was involved
and invites the next author to unredact it. Values are then scanned for
email addresses, JWT/bearer-shaped strings, UUIDs, `file://` URLs,
absolute filesystem paths and URL query strings, and truncated to the
string budget. The attribute cap is applied over sorted keys, so which
attributes survive never depends on object insertion order.

Redaction is a last line of defence. Not collecting the field is the first.

## Sampling

Deterministic per `(sessionId, eventName)` via the canonical hash — never a
simulation RNG stream (`docs/DETERMINISM.md`) and never `Math.random()`. A
session therefore reports an event type consistently or not at all, instead
of producing half a crash loop. Diagnostics run unsampled; performance and
gameplay are sampled by default.

## Transport

`BatchingTelemetrySink` is timer-free: the host calls `pump(now)` from its
own idle/interval orchestration, so telemetry cannot install work on the
simulation tick or render frame path, and tests are deterministic without
fake timers. It batches by size and by the age of the oldest queued event,
enforces a token-bucket rate limit, bounds the queue and drops the *oldest*
events when full (during a crash storm the newest events describe the
current failure). A failed batch is dropped rather than retried
indefinitely. `record()` never throws into its caller: losing a diagnostic
must not break the thing it was diagnosing.

No ingestion endpoint ships with this issue. `TelemetryTransport` is a port;
`MemoryTelemetryTransport` covers tests and development. Choosing and
deploying an ingestion endpoint is a separate decision.

## Release correlation without public source maps

`vite.config.ts` keeps `sourcemap: false` for shipped assets, and
`docs/DEPLOYMENT.md` forbids publishing them. Stack frames are reduced to
`function(bundleFile:line:col)`; combined with `release.buildVersion` they
symbolicate offline against a source map the release process retains
privately. "Just turn sourcemaps on to debug production" is the obvious
wrong fix and is explicitly rejected.

## Retention, deletion and re-identification

| Data | Default retention |
| --- | --- |
| `diagnostics` events | 90 days |
| `performance` events | 90 days |
| `gameplay` aggregates | 30 days |

Retention is enforced by the ingestion side; the client's obligation is to
send the minimum that makes those numbers meaningful. On an account
deletion or data request, telemetry associated with that account is deleted
— in practice there is nothing to look up, because events carry no account
identifier by design, which is the intended outcome rather than a gap. No
attempt is made to re-identify a session id, and session ids are never
joined to account records.

## Adding an event

1. Add a `TelemetryEventDefinition` with a category, a purpose sentence and
   a default sample rate.
2. Confirm the attributes you need are scalars, contain no identifiers, and
   would still be acceptable printed in a public bug report.
3. Add or extend a test asserting what the event does **not** contain.
4. If the new event widens what is collected in kind (not just in volume),
   raise `TELEMETRY_CONSENT_VERSION` so players are asked again.
