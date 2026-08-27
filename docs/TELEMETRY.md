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
| `sampleRate` | The applied rate. A *trusted* receiver can weight by it; an unauthenticated ingest must not — see below. |
| `attributes` | Scalars only; ≤ 24 entries; strings ≤ 200 characters. |

Registered events today: `diagnostic.unhandled-error`,
`diagnostic.save-decode-failed`, `diagnostic.worker-terminated`,
`performance.tick-budget`, `performance.frame-budget`,
`gameplay.scenario-completed`. An unregistered name is refused.

## Producers: what actually emits an event

The pipeline had no producer at all until 2026-08-27. `record()` and
`recordError()` were called from nowhere outside `src/services/telemetry/`, so
consent, admission, sampling, redaction, batching and a transport were a
complete conveyor with nothing placed on it.

Every decision a producer makes is in
`src/services/telemetry/crash-reporting.ts`; `src/main.ts` holds the browser
binding and nothing else. That is the line ADR 0046 §4 drew for the consent
surface, for the same reason: `vitest.config.ts` runs in `node` with no jsdom,
so a rule written beside the listener would have no headless coverage. Only two
things are consequently browser-only — that the listeners are registered, and
that a real thrown error reaches the reporter.

| Registered event | Producer | Where it binds |
| --- | --- | --- |
| `diagnostic.unhandled-error` | `reportUnhandledError` | the page's `error` and `unhandledrejection` listeners, registered at the top of `src/main.ts` |
| `diagnostic.worker-terminated` | `reportWorkerLoss` | the boot `catch` around the first worker, and `WorkerPerSessionHost`'s existing `onWorkerAvailability(false)` callback |
| `diagnostic.save-decode-failed` | **none** | see below |
| `performance.tick-budget`, `performance.frame-budget` | **none** | both would have to be fed from the tick or frame path, which ADR 0010 and `docs/ARCHITECTURE.md` forbid; a producer would need a sampled off-path aggregate first |
| `gameplay.scenario-completed` | **none** | there is no scenario completion to observe yet |

The listeners go in **before** the `Worker`, the scene, the HUD and
persistence. A module-scope throw is reported to whatever is listening at the
moment it happens, so a listener registered further down cannot see the boot
crash — the one case ADR 0010 singles out as impossible to reproduce on a
developer machine.

`diagnostic.save-decode-failed` has no producer because nothing carries a
`SaveDecodeError` to a place a producer may bind.
`PrisonSaveRepository.loadCurrent` walks past a generation that fails to decode
with a bare `continue` and reports only `no-valid-generation` at the end, which
conflates decode failure with a snapshot the worker refused (#103, #403) — so
producing the event from that reason would mislabel a restore bug as save
corruption. The only route that carries the error out is
`importEnvelope`'s `rejected`, which surfaces in `src/ui/save-panel.ts`, a
DOM module the headless suite cannot execute. Giving this event a producer
needs an observer on the repository's load path; that is a change in
`src/persistence/`, not in the telemetry layer, and it is not made here.

### A crash reporter that can itself crash is worse than none

Four properties, tested in `tests/unit/services-telemetry-crash-reporting.test.ts`:

- **It never throws.** Every call into the recorder — and the injected clock —
  is wrapped, and a failure is counted rather than re-raised. A throw out of an
  `error` listener has nowhere to go.
- **It never recurses.** A report already in flight suppresses a nested one, so
  a failure *on the reporting path* arriving back through the same handler
  stops at one frame.
- **It is bounded per page load.** `DEFAULT_MAX_CRASH_REPORTS` is 20, below the
  sink's 60-per-minute bucket and its 200-event queue, so an error storm cannot
  spend the main thread building envelopes or start evicting the earliest
  report — the one most likely to name the original cause.
- **Consent still gates everything.** A producer is not a route around the
  gate: with no decision on record, a produced event is refused by the recorder
  before an envelope exists and by the sink's admission gate if one ever did.

`reportWorkerLoss` carries **no free text at all** — `area` and `phase` come
from closed sets the module declares, and `errorName` is the error's class, not
its message. `reportUnhandledError` cannot: an error message and a stack are
the whole content of a crash report. Redaction is the last line there, and it
is not sufficient — see ADR 0046 on what it does not catch.

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
validation, request bounds, a written resolution of the conflict with
[ADR 0008](./adr/0008-trusted-service-boundary.md) §3's rule that no
unauthenticated mutation endpoint exists, and two rules about not trusting the
body: **retention must key on a server-stamped `received_at`**, because
`occurredAt` has no upper bound and an event dated far in the future would
never fall out of a window keyed on it; and **no aggregate may weight by the
client's `sampleRate`**, because `1 / sampleRate` is a multiplier an
unauthenticated caller controls, unbounded at the `0` the schema admits. The
receiver takes the rate from its own copy of the event registry and treats the
client's as a claim to compare. Neither has a client-side fix: an attacker who
does not run this client is unaffected by anything this client validates. It also records that shipping this
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
