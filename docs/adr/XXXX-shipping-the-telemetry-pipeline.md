# ADR XXXX: Shipping the telemetry pipeline, and what shipping it obliges

## Status

**Proposed. Not accepted, and deliberately not self-approved.**

Three of the things this document decides are not inside a delegation. The first
is *where player data goes*, which is a deployment and a processor decision. The
second is that shipping this **creates data-protection obligations the
repository documents nowhere** — the word "GDPR" does not appear in this
repository, `docs/SECURITY.md` is 254 lines about in-game prison sectors and
guards, and no file anywhere records a lawful basis, a controller, a retention
job or a data-subject route. The third is that a telemetry ingestion endpoint
would be **the first unauthenticated write path in this system**, which
[ADR 0008](./0008-trusted-service-boundary.md) §3 currently forbids in one
sentence.

The client half described here is implemented and tested. **It sends nothing,
and cannot, until somebody sets two deployment variables** — which is the whole
point of decision 2 and is the state every build in this repository is in.
Accepting or rejecting this ADR changes no behaviour on its own.

**Numbered `XXXX` by the central-assignment rule** (`docs/AGENT_WORKFLOW.md`
§2), and this document pre-commits to renumbering without argument.
`docs/adr/README.md` is deliberately not edited here.

## Context

### What existed, re-measured rather than taken from the issue

`src/services/telemetry/` held **771 lines across 8 files with no production
caller** — consent, an event registry, redaction, deterministic sampling, crash
diagnostics, a bounded rate-limited sink and a transport *port* with only an
in-memory implementation. [ADR 0044](./0044-what-happens-to-a-service-tier-nothing-calls.md)
decided to keep it, "on the shortest leash of the four", and put the question
that governed it to the owner as its open question 2: *"Does Lockstate collect
telemetry?"*

**The owner has answered yes.** This ADR is what that answer costs.

Three independent things stopped the layer sending, and all three were real:

1. `TelemetryTransport` had one implementation, `MemoryTelemetryTransport`.
2. `tests/unit/services-layer-boundaries.test.ts` refused `fetch`,
   `XMLHttpRequest`, `navigator.sendBeacon`, `WebSocket`, `EventSource`,
   `indexedDB`, `sessionStorage` and the Cache API anywhere under
   `src/services/`, against a **deliberately empty** allow-list.
3. `public/_headers` sets `connect-src 'self'`.

Two further facts shaped the design more than any of those. Nothing called
`BatchingTelemetrySink.pump`, so the sink — correctly timer-free — never
flushed. And the four `telemetry.consent.*` strings shipped inside the bundle
through `defaultMessageCatalogEn` with nothing rendering them, which ADR 0044
called the clearest single statement of what was wrong: *"a player downloads the
consent prompt for a telemetry system that cannot send"*.

### The defect that was independent of every decision here

`src/services/telemetry/recorder.ts` claimed in its own header that it enforced
registration, consent, sampling, redaction and validation *"so no caller can
construct an envelope that skips a privacy control by calling the sink directly
with a hand-built object"*.

**That sentence was false the day it was written.**
`BatchingTelemetrySink.record(envelope, now)` was `public`, took an
already-shaped `TelemetryEnvelope`, and performed rate-limiting and queueing
only: no consent check, no registry check, no redaction, no validation. Anything
holding the sink could enqueue a diagnostics envelope for a player who had
refused diagnostics, carrying attributes redaction would have dropped — and
every gate in this repository stayed green.

It was latent only because nothing sent. It stops being latent in the same
change that adds a transport, which is why it is fixed first and separately.

### What redaction does not catch, stated because ADR 0010 says it is the last line

`redactText` blanks seven value shapes — email, JWT, bearer token, UUID,
`file://`, unix home/system paths and URL query strings. It does **not** catch:
an IP address; a player-chosen prison name; an actor name from the name pool; or
a prison id, because #338 records that prison ids are not UUIDs. `errorMessage`
and `frames` are free text and are the two attributes most likely to carry any
of them.

This is not a new finding and it is not a reason to withhold the pipeline —
ADR 0010 already says redaction is *"a last line of defence, not the mechanism"*
and that not collecting the field is the first. It is recorded here because the
first line of defence is the event registry, and the registry is the thing a
future event author edits.

### There is no data-protection position in this repository at all

Searched, not assumed: "GDPR", "lawful basis", "data protection" and "data
subject" appear in no `.md`, `.ts` or `.sql` file in this tree.
`docs/SECURITY.md` is about the *game's* security systems. `docs/TELEMETRY.md`
promises 90/90/30-day retention and deletion on request and says *"Retention is
enforced by the ingestion side"* — a side that does not exist. The one place
`supabase/` mentions telemetry at all is a comment in
`20260823090000_create_entitlement_events.sql` explaining why the entitlements
table leaves `DELETE` to `auth.users`' cascade so *"the data-deletion obligation
in docs/TELEMETRY.md"* still works. (ADR 0044 says *"nothing under `supabase/`
mentions telemetry"*; that comment is the exception, and it changes nothing —
there is still no telemetry schema.)

## Decision

### 1. First-party, same-origin ingestion. Third-party analytics is rejected.

Telemetry goes to infrastructure this project already controls, reached from
the browser as a **root-relative path on the site's own origin**. No third-party
analytics or crash-reporting SDK is adopted.

Three reasons, in order of weight:

- **It creates no new processor relationship.** A third-party SDK means player
  data reaching a company the owner has to contract with, review and disclose.
  That is a commercial and legal decision, and `AGENTS.md` already requires an
  ADR plus explicit human approval for one.
- **It leaves `connect-src 'self'` intact.** Same-origin is the only shape that
  does. Anything else means widening a security header, which is
  [ADR 0021](./0021-http-response-security-headers.md)'s and is a change the
  owner should see on its own terms rather than as a side effect of telemetry.
- **It inverts nothing.** ADR 0010's objection to a third-party SDK is that it
  collects broadly and filters later, and typically fingerprints. The allow-list
  registry, the consent gate and the redaction pass are the design; an SDK
  replaces all three with a vendor's defaults.

**The owner can overturn this.** It is an assumption chosen because it is the
only one that changes nothing else, not a conclusion from evidence about
vendors. If the owner prefers a hosted service, the changes are bounded and
listed under "Alternatives considered".

### 2. The destination comes from deployment configuration, and absent is the default

`src/services/telemetry/ingestion-config.ts` resolves two compile-time strings —
`LOCKSTATE_TELEMETRY_INGEST_PATH` and `LOCKSTATE_TELEMETRY_ENVIRONMENT`, passed
through `vite.config.ts`'s `define` by `tooling/telemetry-config.mjs`, exactly as
`tooling/build-identity.mjs` already passes the build's version and commit.

**No URL, host, project reference or table name appears anywhere in `src/`.**
`sink.ts` has always said why — *"an ingestion endpoint is a deployment
decision, and inventing one here would ship a URL nobody reviewed"* — and that
sentence still holds.

With the configuration absent, `createTelemetryPipeline` returns
`{ enabled: false, reason: 'absent' }` and constructs **nothing**: no transport,
no sink, no recorder, no session id, and no consent prompt. Not a disabled
transport, not a no-op sink — nothing that a later bug could re-enable. Absent
is the default; no workflow in `.github/workflows/` sets either variable; and
`tests/unit/services-telemetry-transport.test.ts` asserts the absent path
against the real resolvers `vite.config.ts` calls, with a `fetch` stub that
throws if anything reaches for the network.

Two refusals are worth naming because they fail closed rather than warning:

- **Not same-origin.** An `https://…` or `//host/…` destination is refused with
  its own reason rather than attempted. This is what makes "no `public/_headers`
  change was needed" a checked fact: a deployment cannot quietly configure a
  cross-origin host and discover the CSP at runtime.
- **No environment.** `ReleaseIdentity.environment` is on every envelope and
  cannot be inferred in a browser. Guessing `production` would mislabel every
  staging crash, so a destination with no environment sends nothing.

**`public/_headers` is not changed by this ADR, and does not need to be.** Its
existing note that `connect-src 'self'` is a latent breakage for cloud save
remains exactly as true as it was.

### 3. `BatchingTelemetrySink.record` enforces what the recorder enforces

The bypass in "Context" is closed by making the sink **safe to call** rather
than hard to call. TypeScript cannot grant one class private access to another,
and any symbol that hid the method would still leave the object reachable
through the composition root or a test double — so hiding it would move the
problem rather than solve it.

`BatchingTelemetrySink` now takes a `TelemetryAdmission` as a **required**
constructor argument, so a sink that admits everything cannot be built by
forgetting an option. `consentGatedTelemetryAdmission` checks, on every
envelope, in this order: envelope schema, that the name is registered, that the
envelope's category is the one the registry declares for that name, that consent
allows that category, and that the attributes are already a fixed point of
`redactAttributes`. The check happens **before** the rate limit, so hand-built
rejects cannot spend the budget a real crash report needs.

The category-agreement check is the one that is easy to miss: consent is per
category, so the interesting attack is not "send without consent" but "send a
diagnostic labelled `gameplay` to a player who allowed gameplay".

Two things it deliberately does not check. **Sampling**, which is a volume
control rather than a privacy control and legitimately differs from the registry
default when `sampleRateOverrides` says so. And **the transport**: a caller
holding the `TelemetryTransport` can post whatever it likes, and the control
there is that exactly one transport is constructed, in the composition root,
from deployment configuration.

The recorder's header no longer claims what it cannot deliver. It now says which
class holds the guarantee, and that bypassing the recorder buys nothing while
bypassing the sink is undefended.

**Cost, stated rather than hidden.** An admitted event is schema-parsed and
redacted twice — once by the recorder building it, once by the gate. Attributes
are scalars capped at 24 and arrivals are capped at 60 per minute by the token
bucket, and nothing on the tick or frame path calls either. Defence in depth is
worth that.

### 4. The consent surface: every decision outside the DOM

`vitest.config.ts` runs in `node` with no jsdom, so anything touching `document`
is unreachable from `pnpm test`. A consent gate whose *rules* lived in a DOM
module would be a privacy control with no headless coverage at all.

So `src/services/telemetry/consent-flow.ts` holds all of them — whether to ask,
what a stored decision means (`absent` / `current` / `superseded` /
`unreadable`), which categories exist, which label each carries, what the draft
starts as, and what a toggle does — and `src/ui/telemetry-consent-prompt.ts`
holds element construction and two event listeners. The split is *enforced*
rather than intended: the services-layer gate refuses `document.`/`window.`
under `src/services/`, so the decision module cannot acquire a DOM dependency.

Consequences of the split, said plainly:

- Browser-only, and therefore only reachable from the Playwright suite: that the
  elements are created, that the checkbox handler reaches the reducer, that the
  buttons call back, that the card is removed.
- Headless: everything that decides anything.

Four decisions inside it are worth recording:

- **The prompt appears only when there is somewhere to send.** Asking a player
  to consent to a collection that cannot happen is ADR 0044's defect with more
  steps.
- **Nothing is pre-ticked.** A pre-ticked box is opt-out wearing a checkbox, and
  ADR 0010 rejects opt-out.
- **"Send nothing" writes a decision.** A refusal is recorded, so the prompt does
  not come back. Deferring would make refusal cost more than accepting, which is
  the shape of a dark pattern.
- **A superseded decision is not carried forward at all.** Raising
  `TELEMETRY_CONSENT_VERSION` re-asks, and the old categories are not used as
  defaults for the new question.

It is a card in a corner. It blocks nothing, dims nothing and takes no focus.

### 5. The pump is an idle callback, and nothing flushes on unload

`src/services/telemetry/pump.ts` owns the loop with the scheduler injected;
`src/main.ts` supplies `requestIdleCallback` and falls back to `setTimeout`
where it does not exist. Never `requestAnimationFrame`: ADR 0010 and ADR 0008's
T11 both put trusted-service work off the tick and frame paths, and an idle
callback is the one browser primitive that promises it.

The loop never runs two pumps at once (the next tick is armed only after the
previous settles, because `flush` de-duplicates concurrent flushes by returning
the in-flight promise), never dies on a rejected pump, and stops cleanly
including from inside a running pump.

**Nothing flushes on `pagehide`.** Whatever is queued when the tab goes away is
lost, bounded by the sink's flush interval. That is a choice: a `keepalive` send
fired during unload is the shape that most often turns diagnostics into
tracking, and the events lost are aggregates nobody is waiting on. It is written
down because it is the first thing a reader will want to add.

### 6. The egress gate gains exactly one entry

`MODULES_PERFORMING_IO` names `services/telemetry/http-transport.ts` and nothing
else. The destination's *validation* lives in a separate module precisely so
that only the *sending* is allow-listed; a `services/telemetry/*.ts` pattern
would have been shorter and would have granted the whole subsystem permission to
reach the network.

The gate was also made load-bearing rather than decorative: the scan takes its
allow-list as a parameter, and a second assertion runs it with an **empty** list
and requires it to report exactly the transport. A version of the scan that
skipped the subsystem by prefix, or stopped consulting the map, passes the first
assertion and fails the second.

`docs/ARCHITECTURE.md`'s "nothing here leaves the device yet" is corrected in
the same change, as that gate's failure message demands.

### 7. Retention and deletion are **not** implemented here, and are unenforced

No retention or deletion enforcement is added to the client, because neither can
live there: a client cannot delete what a server has, and a client that could
would be a client that could delete other players' data.

`docs/TELEMETRY.md` already promises 90 days for diagnostics, 90 for performance
and 30 for gameplay aggregates, plus deletion on request. **Those promises are
unenforced today and this change does not make them true.** What the ingestion
side must do before they are:

1. **A retention job that actually deletes.** Scheduled, on the stored
   `occurred_at`, per category, with the deletion itself observable — a
   documented promise with no job behind it is worse than no promise.
2. **Do not store an IP address.** Every HTTP request carries one, and an IP is
   personal data that this design collects nowhere else. The endpoint must
   neither log it nor persist it; if a rate limiter needs one, it must key on a
   value that is not retained.
3. **Do not join a session id to anything.** Session ids rotate per browser
   session and are never derived from the account id, which is what makes the
   data aggregate. A join to an account, a save or a request log undoes that in
   one query.
4. **Validate server-side against the same schema.** The client validates and
   the client is Z0 — untrusted by ADR 0008's own first row. An unvalidated
   ingest is an open write endpoint with a JSON body.
5. **Bound it.** Body size, batch size, request rate. The client rate-limits
   itself and the client is not trusted to.
6. **Resolve the ADR 0008 §3 conflict, in writing.** ADR 0008 says every trusted
   mutation path authenticates first and that *"no unauthenticated mutation
   endpoint exists"*. Telemetry ingestion is, by design, unauthenticated —
   events carry no account identifier, and requiring a JWT would attach the
   identity ADR 0010 spent its whole design avoiding. **This is a real conflict
   and this ADR does not resolve it.** Either ADR 0008 gains a narrow, stated
   exception for append-only, non-account-scoped, aggregate-only ingestion, or
   telemetry is not deployed. It should not be settled by an implementation.

**Proposed migration content, not written, because `supabase/migrations/` is
history and not mine to add to.** If ingestion terminates in Supabase behind a
Cloudflare Worker, the shape the rest of this repository would expect is: a
`telemetry_events` table keyed by the client's `event_id` for idempotent
replays; columns for `schema_version`, `name`, `category`, `occurred_at`,
`session_id`, `release`, `consent_version`, `sample_rate` and a `jsonb`
`attributes`; **no `user_id` column at all**, so the join in item 3 is
structurally impossible rather than merely forbidden; no RLS policy granting
`anon` or `authenticated` any verb, with all writes through a `SECURITY DEFINER`
function the Worker calls with a server-side key; `TRUNCATE` revoked in line
with ADR 0008; and a scheduled deletion by `occurred_at` and `category`
implementing item 1. That is a sketch for review, not a specification.

### 8. The legal obligations are named, and are the owner's

**I am not a lawyer and this ADR does not state the repository's legal
position.** What it does is refuse to let shipping create obligations nobody
wrote down. The following are open items for the owner, listed because they
become live the moment the two deployment variables are set:

- **A lawful basis.** Opt-in consent is the design and is the most defensible
  basis available, but "we built consent" is not the same as "we recorded which
  basis we rely on and for what".
- **A controller, and a privacy notice a player can read.** The consent prompt
  says what is collected in three sentences. It is not a privacy notice and does
  not pretend to be.
- **The data-subject deletion route.** `docs/TELEMETRY.md` says telemetry
  associated with an account is deleted on request and that *"in practice there
  is nothing to look up, because events carry no account identifier by design"*.
  That is true and is a good answer — but it needs a route to receive the
  request through, and the account UX that would carry one is #34 and is
  unbuilt.
- **A record of processing.** What is collected, why, where it is stored, how
  long, who can reach it.
- **Whether a child-audience assessment applies.** A browser prison-management
  game is plausibly played by minors, and consent-based collection from a child
  is a different question from consent-based collection generally. Raised, not
  answered.

Nothing above blocks the client change, because the client change sends nothing.
All of it blocks the deployment.

## Alternatives considered

- **A third-party analytics or crash SDK.** Rejected, restating ADR 0010: it
  inverts the design, adds an opaque dependency on the most privacy-sensitive
  path in the client, typically fingerprints, and creates a processor
  relationship. It would also require widening `connect-src`. If the owner
  prefers one, the bounded changes are: a new ADR and a data-processing review;
  `connect-src` gains the vendor origin; `resolveTelemetryIngestion` accepts an
  absolute origin; and this ADR is superseded rather than amended, because its
  first decision is the one that changed.
- **A cross-origin first-party host** — for example a Supabase Edge Function on
  the project's own domain. Rejected *for now*, and it is the closest
  alternative: it is still first-party and creates no new processor, but it
  needs `connect-src` widened and a CORS story, and it makes the CSP depend on a
  project reference #446 records as the owner's. Reconsider if a same-origin
  route turns out to be more expensive to operate than it looks.
- **Inserting into Supabase directly from the browser through PostgREST.**
  Rejected outright: it is cross-origin, and an anonymous insert policy on a
  table is an open write endpoint with a published key in front of it.
- **A `keepalive` flush on `pagehide`.** Rejected; see decision 5.
- **Shipping the consent prompt now and the transport later.** Rejected: it is
  the exact defect ADR 0044 named.
- **No telemetry at all.** A real answer, and ADR 0044's open question 2 offered
  it. The owner ruled the other way.

## Consequences

- The trusted-services layer leaves the device for the first time. One module,
  written down, with `docs/ARCHITECTURE.md` corrected.
- `src/services/telemetry/` leaves ADR 0044's parked set. Three trees remain
  parked, and all three still have a live server half — the discriminator ADR
  0044 turned on now has no exception.
- Every shipped build still sends nothing. The pipeline's default state and its
  tested state are the same state.
- `docs/TELEMETRY.md`'s retention table remains a promise with nothing behind
  it, and now says so in its own words rather than only in this ADR.
- A future event author has more to get right, not less: the registry is the
  first line of defence and redaction does not catch a prison name.

## Open questions

1. **Where does the path terminate?** The owner's. `wrangler.jsonc` today
   declares Static Assets with no Worker script (`main`), so **no route answers
   any path** and the configuration cannot usefully be set until one exists.
2. **Does ADR 0008 gain an unauthenticated-ingest exception, or does telemetry
   not deploy?** Decision 7 item 6. Not resolvable inside an implementation.
3. **Who is the controller, and where does the privacy notice live?**
4. **Should `TELEMETRY_CONSENT_VERSION` be raised by this change?** Argued no:
   nothing new is collected in kind — the same six registered events with the
   same attributes — only the transport that was always described now exists.
   The counter-argument is that consent given to a system that could not send is
   consent nobody gave. Since no consent has ever been stored anywhere, the
   question is currently academic, and it will not be after the first
   deployment.
5. **Should the consent decision be re-openable after it is made?** Today it is
   a one-time prompt, and a player who declines has no way back. ADR 0010 says
   the player must be able to change it offline, and storage-level support
   exists (`saveTelemetryConsent` is idempotent); what is missing is a settings
   surface, which belongs with the settings work rather than here. **This is the
   part of the current implementation that least matches ADR 0010**, and it is
   named rather than buried.

## What would change my mind

The weakest claim here is **decision 1's same-origin restriction**. It is
enforced in code, and enforcement is the right way to hold a decision — but the
decision rests on `connect-src 'self'` being worth more than operational
convenience, and nobody has yet had to operate the endpoint. If the first
deployment finds that a same-origin route means standing up a Worker for one
`POST`, the honest response is to widen `resolveTelemetryIngestion` and
`connect-src` together, in one reviewed change, rather than to discover the
restriction as an obstacle.

The second weakest is **the redaction fixed-point check** in decision 3. It
proves attributes went through `redactAttributes`; it proves nothing about
whether `redactAttributes` catches what matters, and the context section lists
four things it does not catch. It is a check that the process ran, not that the
process is sufficient.

## References

- Issues [#36](https://github.com/matmaxalez/lockstate/issues/36) (the trusted
  tier and its remainder), [#446](https://github.com/matmaxalez/lockstate/issues/446)
  (the four questions reserved for the owner, of which telemetry was one),
  [#378](https://github.com/matmaxalez/lockstate/issues/378) and
  [#141](https://github.com/matmaxalez/lockstate/issues/141) (the inventories),
  [#34](https://github.com/matmaxalez/lockstate/issues/34) (the account UX a
  deletion route would arrive with), [#338](https://github.com/matmaxalez/lockstate/issues/338)
  (prison ids are not UUIDs, which is why redaction does not catch one).
- [ADR 0008](./0008-trusted-service-boundary.md) — the trust boundary, the Z0/Z2
  zones, T8 and T10, and §3's rule that decision 7 item 6 conflicts with.
- [ADR 0010](./0010-telemetry-and-diagnostics-privacy.md) — the privacy design
  this implements. Amended by this change only where it states, as of a date,
  that no feed exists.
- [ADR 0021](./0021-http-response-security-headers.md) — `connect-src 'self'`,
  and its "Latent consequences" section, which this decision deliberately does
  not add to.
- [ADR 0044](./0044-what-happens-to-a-service-tier-nothing-calls.md) — the
  parked-tier decision whose open question 2 this answers.
- [TELEMETRY.md](../TELEMETRY.md) — the tier document, corrected in the same
  change.
