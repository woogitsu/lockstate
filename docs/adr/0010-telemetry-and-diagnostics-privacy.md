# ADR 0010: Privacy-Controlled Telemetry and Crash Diagnostics

## Status
Accepted

## Context
Lockstate needs to know when it crashes, when a save fails to load and when
a frame or tick budget is being missed on real hardware — none of which is
visible from a development machine. Issue #36 requires that capability to
exist without turning into tracking, and explicitly puts behavioral
advertising, fingerprinting, hidden analytics and raw save/PII capture out
of scope.

The player-facing risk is asymmetric: a missing metric costs engineering
time; a leaked save, account identifier or file path costs player trust and
may be unlawful. The design must therefore be conservative by construction,
not by reviewer diligence.

## Decision

### Off by default, opt-in per category, versioned consent
`TelemetryConsent` is a per-category boolean set that defaults to **all
false**, including crash diagnostics. Nothing is queued, sampled or sent
before the player makes a choice. Categories:

| Category | Purpose | Examples |
| --- | --- | --- |
| `diagnostics` | Errors and crashes | unhandled rejection, save decode failure |
| `performance` | Budget/scale health | tick duration percentiles, path-queue backlog |
| `gameplay` | Coarse aggregate product signal | scenario completed, feature used |

Consent carries `consentVersion`. Raising `TELEMETRY_CONSENT_VERSION`
invalidates a stored decision and re-asks — a consent given for one policy
is not consent for a wider one. Consent state lives client-side (the player
must be able to change it offline) and is stored outside any prison save.

### Allow-listed schema, not free-form attributes
Every event is a versioned `TelemetryEnvelope` validated with Zod before it
can be enqueued. Attribute values are restricted to scalars, attribute
count and string length are capped, and event names must be registered
identifiers. An event that fails validation is dropped locally, never sent
"best effort" — a malformed diagnostic is not worth a privacy incident.

### Redaction is mandatory and runs on every event
`redactAttributes()` runs unconditionally after validation, even for
attributes the caller believes are safe:

- keys matching sensitive patterns (`token`, `key`, `secret`, `password`,
  `auth`, `session`, `email`, `jwt`, `cookie`, `signature`, …) are dropped;
- values matching email addresses, bearer/JWT-shaped strings, UUID-shaped
  identifiers, `file://`/absolute filesystem paths and URL query strings
  are replaced with a redaction marker;
- strings are truncated to a fixed budget.

Redaction is a *last line of defence*, not the mechanism: not collecting
the field remains the first choice.

### What is never collected by default
Save payloads or any fragment of them; prison, entity or command data;
account email or any auth token; IP-derived precise location; device
fingerprints; third-party advertising or session-replay SDKs (there are
none, and adding one requires an ADR plus explicit human approval per
`AGENTS.md`).

Crash reports carry: error name, redacted message, stack frames reduced to
`function@bundleFile:line:col`, build/release identifiers, and a rotating
session id. The session id is generated per browser session, never
persisted and never derived from the account id, so it correlates events
inside one session and nothing across sessions.

### Sampling is deterministic and declared
Sampling uses `deterministicStateHash([sessionId, eventName])` against the
category's rate (`src/services/telemetry/sampling.ts:16`), so a session either
reports an event type consistently or not at all — no partially-sampled
sequences that misrepresent frequency. The key is a two-element array, not the
`sessionId + eventName` concatenation this paragraph used to describe, and the
array is the better of the two: a concatenation loses the boundary, so the
pairs `("ab", "c")` and `("a", "bc")` would hash identically and share one
sampling decision. A two-element array keeps them distinct.
Diagnostics default to rate 1 (a crash is rare and always interesting);
performance and gameplay are sampled. The applied rate travels with the
event so the receiver can weight correctly instead of guessing.

### Transport never blocks the game
`BatchingTelemetrySink` enqueues in O(1), batches by size and interval,
enforces a token-bucket rate limit and a bounded queue that drops the
*oldest* events (recording a drop count) when full. It never throws into
its caller, never awaits inside `record()`, and a failed flush drops the
batch rather than retrying forever. Nothing in `src/simulation/` or the
render loop may import the sink; telemetry is to be fed from the main thread's
orchestration layer, off the tick and frame paths.

**As of 2026-08-24 that feed does not exist.** No module outside
`src/services/telemetry/` calls into this layer: the only reference to it
anywhere else in `src/` is the barrel re-export `export * from './telemetry'`
(`src/services/index.ts:21`), and nothing imports that barrel either. So
`TelemetryConsent` is never asked for, `record()` is never called and
`BatchingTelemetrySink` never flushes. Every module specified here is built and
tested — `tests/unit/services-telemetry.test.ts` — and none is wired —
the same posture [ADR 0008](./0008-trusted-service-boundary.md) states
explicitly for the server-side deployment units, which this ADR inherits
without having said so. Wiring the first `record()` call is the moment the
boot path must also obtain consent; it obtains none today.

### Release correlation without public source maps
`vite.config.ts` keeps `sourcemap: false` for shipped assets. Diagnostics
carry `buildVersion` (and optionally a commit/version id) so a stack frame
can be symbolicated *offline* against a source map retained privately by
the release process. Source maps are never uploaded to Static Assets and
never served publicly — restated here because "just enable sourcemaps to
debug production" is the obvious wrong fix.

### Retention and deletion
Documented in `docs/TELEMETRY.md`: default retention 90 days for
diagnostics/performance and 30 days for gameplay aggregates, deletion on
account request, and no re-identification attempts. Retention is enforced
by the ingestion side; the client's obligation is to send the minimum that
makes those numbers meaningful.

## Alternatives considered
- **A third-party analytics/crash SDK.** Rejected for now: it inverts the
  design (collect broadly, filter later), adds an opaque dependency on the
  client's most privacy-sensitive path, and typically ships fingerprinting.
  If one is ever adopted it needs its own ADR and a data-processing review.
- **Opt-out instead of opt-in.** Rejected: higher volume, worse trust, and
  a much harder consent story in the EU. The signal we need (crashes) is
  rare enough that a smaller consenting population is sufficient.
- **Attaching the account id to every event.** Rejected: it converts
  aggregate telemetry into a per-player behavioral record. Account identity
  is added only where a player explicitly submits a report.

## Consequences
- Telemetry volume is low and biased toward consenting players; conclusions
  must be stated as such.
- Adding a new event means adding a schema entry and a documented purpose —
  intentional friction.
- Symbolication requires the release process to archive source maps
  privately; without that, stacks stay bundle-relative.
