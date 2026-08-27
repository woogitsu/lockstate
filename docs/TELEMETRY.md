# Telemetry and crash diagnostics: privacy policy and implementation

Issue #36 requires diagnostics that are useful to engineering and
uninteresting to a privacy regulator. The decision record is
[ADR 0010](./adr/0010-telemetry-and-diagnostics-privacy.md); shipping it —
the transport, the consent surface and the host pump — is decided in
[ADR 0046](./adr/0046-shipping-the-telemetry-pipeline.md). The implementation
is `src/services/telemetry/`, tested in `tests/unit/services-telemetry.test.ts`,
`tests/unit/services-telemetry-consent-flow.test.ts`,
`tests/unit/services-telemetry-pump.test.ts` and
`tests/unit/services-telemetry-transport.test.ts`.

**Every build of this repository sends nothing, and cannot.** The transport
takes its destination from deployment configuration, no workflow sets it, and
with it absent nothing is constructed at all — no transport, no sink, no
recorder, and no consent prompt. Everything below describes what a *configured*
build does.

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
consent for one policy is not consent for a wider one, and the superseded
decision is not carried forward as a default for the new question. Withdrawing
consent takes effect on the very next event, with no flush of what is already
queued required to make that true — the recorder and the sink's admission gate
read one `TelemetryConsentGate`, so there is no arrangement in which one has
stopped and the other has not.

### The prompt

`src/ui/telemetry-consent-prompt.ts` renders it; every decision behind it is in
`src/services/telemetry/consent-flow.ts`, which the services-layer boundary gate
keeps free of the DOM. It is a card in a corner, not a modal: it blocks nothing
and takes no focus, because refusing must cost a player nothing. Nothing is
pre-ticked, and "Send nothing" writes a real decision rather than deferring one,
so declining is as final as accepting and the prompt does not return.

**It is mounted only by a build that has an ingestion destination configured.**
Asking a player to consent to a collection that cannot happen is the defect
[ADR 0044](./adr/0044-what-happens-to-a-service-tier-nothing-calls.md) named
when these four strings shipped inside the bundle with nothing rendering them.

There is no way to reopen the decision after it is made. That is the part of the
current implementation that least matches ADR 0010's "the player must be able to
change it"; it needs a settings surface, and ADR 0046 records it as an open
question rather than a finished story.

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

## The sink is a privacy boundary, not plumbing

`BatchingTelemetrySink.record` is `public` and must stay callable — the recorder
is a separate class and TypeScript cannot grant one class private access to
another. It used to check nothing but its rate limit and its queue bound, while
`recorder.ts` claimed no caller could enqueue a hand-built envelope past a
privacy control. That claim was false. It now holds, and it holds because of the
sink: a required `TelemetryAdmission` re-checks the envelope schema, that the
name is registered, that the envelope's category is the one the registry
declares for it, that consent allows that category, and that the attributes are
already a fixed point of redaction — before the rate limit, so a refused
envelope cannot spend a real crash report's budget.

The category check is the one worth naming: consent is per category, so the
interesting attack is not "send without consent" but "send a diagnostic labelled
`gameplay` to a player who allowed gameplay".

Sampling is deliberately not re-checked — it is a volume control, not a privacy
control. Nor is the transport defended: a caller holding it can post whatever it
likes, and the control there is that exactly one is constructed, in the
composition root, from deployment configuration.

## Transport

`BatchingTelemetrySink` is timer-free: the host calls `pump(now)` from its
own idle/interval orchestration, so telemetry cannot install work on the
simulation tick or render frame path, and tests are deterministic without
fake timers. That host is `src/services/telemetry/pump.ts`, driven from
`src/main.ts` by `requestIdleCallback` (falling back to a timeout where it does
not exist) — never a frame callback. The loop never runs two pumps at once and
never dies on a rejected one. **Nothing flushes on `pagehide`:** whatever is
queued when the tab goes away is lost, bounded by the flush interval, because a
`keepalive` send during unload is the shape that most often turns diagnostics
into tracking. It batches by size and by the age of the oldest queued event,
enforces a token-bucket rate limit, bounds the queue and drops the *oldest*
events when full (during a crash storm the newest events describe the
current failure). A failed batch is dropped rather than retried
indefinitely. `record()` never throws into its caller: losing a diagnostic
must not break the thing it was diagnosing.

### Where it sends, and why usually nowhere

No endpoint is written down in `src/`. `resolveTelemetryIngestion` takes two
compile-time strings the deployment sets — a **root-relative, same-origin path**
and one of `development`/`staging`/`production` — and refuses everything else:
an absolute URL, a protocol-relative reference, a query string, a fragment, a
traversal, or a destination with no environment. Same-origin only is what keeps
`public/_headers`' `connect-src 'self'` untouched, and refusing the alternatives
in code is what makes that a checked fact rather than a claim.

With the configuration absent — which is every build in this repository, since
no workflow sets either variable — nothing is constructed. `HttpTelemetryTransport`
is the one module in `src/services/` that leaves the device and the only entry
in `tests/unit/services-layer-boundaries.test.ts`'s I/O allow-list. It posts
with `credentials: 'omit'`, `mode: 'same-origin'` and `redirect: 'error'`, under
an abort deadline, and it never retries: a failed batch is dropped by the sink,
silently, because a diagnostics pipeline that reports its own failures can spam a
player about a problem they did not have.

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

**These numbers are not enforced by anything today.** Retention is the
ingestion side's to enforce and no ingestion side exists; the client's
obligation is only to send the minimum that makes them meaningful, and it does.
[ADR 0046](./adr/0046-shipping-the-telemetry-pipeline.md) lists what the
ingestion side must do before this table is true — a scheduled deletion job, no
stored IP address, no join from a session id to anything, server-side schema
validation, request bounds, and a written resolution of the conflict with
[ADR 0008](./adr/0008-trusted-service-boundary.md) §3's rule that no
unauthenticated mutation endpoint exists. It also records that shipping this
creates data-protection obligations this repository documents nowhere, and names
them as open items for the owner. On an account
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
