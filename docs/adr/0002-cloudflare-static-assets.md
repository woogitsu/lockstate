# ADR-0002: Cloudflare Workers Static Assets delivery

- Status: Accepted
- Date: 2026-08-22

## Context

Lockstate must launch immediately in a browser and should not require a later migration from a temporary static-hosting target to the intended production runtime. The current application is an assets-only SPA. Trusted server capabilities may be introduced later, but the simulation loop remains client-side.

The deployment contract must support deep links, safe cache invalidation, production-like local preview, isolated staging, an explicit custom domain and a documented rollback path.

## Decision

- Use the official `@cloudflare/vite-plugin` with Vite 8 and Wrangler 4.
- Keep `wrangler.jsonc` as the repository source of truth.
- Deploy the current application as an assets-only Worker with no application-server entry point.
- Let the Vite plugin generate the final `assets.directory`; do not hard-code it in the input config.
- Configure `assets.not_found_handling` as `single-page-application` in every environment.
- Use a top-level local development environment, a named `staging` environment and a named `production` environment.
- Deploy production as Worker `lockstate` on the Custom Domain `lockstate.io`, with `workers.dev` and version preview URLs disabled.
- Deploy staging as `lockstate-staging` on `workers.dev`, with preview URLs enabled and no production domain.
- Do not configure `www.lockstate.io` until a canonical-host redirect policy is accepted.
- Author static response headers in `public/_headers` so the same behavior is tested in build, preview and deploy.
- Cache fingerprinted Vite assets immutably while keeping HTML and SPA fallback responses revalidating.
- Do not publish browser source maps as Static Assets. A future private error-reporting pipeline may upload them separately.
- Keep production publishing outside ordinary CI until a protected release workflow and credential policy are accepted.
- Automatically validate generated environment configuration, Wrangler dry-runs and local preview behavior.

### Operational note, 2026-08-24: what is configured here is not what is deployed

The two deployment bullets above describe the topology this ADR **decided**, and `wrangler.jsonc` configures exactly that: `:11-18` for `lockstate-staging` on `workers.dev` with no route, `:19-32` for `lockstate` on the `lockstate.io` Custom Domain with `workers_dev` and `preview_urls` false. Neither describes what is currently serving traffic.

`docs/DEPLOYMENT.md`'s section **"What currently serves lockstate.io"** records the operating state: `lockstate.io` is served by **`lockstate-staging`** — the Worker the `staging` job deploys — through a Custom Domain attached by hand in the Cloudflare dashboard, and the Worker `lockstate` that this ADR names as production is *"a Worker that has never been deployed"*. Two things follow, and the second is why this note exists:

- A merge to `main` already updates the public site: the `staging` job runs on every push to `main`, so `lockstate.io` tracks `main` with no further configuration. That section says it in those terms — *"Nothing needs to be enabled for that to happen; it is happening."*
- **Dispatching the `production` job would take the live domain off the Worker currently holding it** and transfer it onto a freshly created one, and wrangler does not warn. That section's second bullet is the one that says so — *"Dispatching the `production` job would silently take the domain away … Running that job transfers the live domain onto it, and wrangler does not warn."* Read the whole section before acting on the production bullet above.

**Every reference above is by section title and quotation, and the three line numbers this paragraph used to carry were all wrong.** It cited the section as `docs/DEPLOYMENT.md:165-176`, the trap as `:172` and the unverifiability as `:176`. The section begins at `:196`; `:165-176` spans a *different* section, **"What can publish the staging Worker"** (`:166`), which is about which credentials let CI publish staging and says nothing about what holds the domain. So the three anchors did not merely drift by a few lines — they landed on a neighbouring subject that reads plausibly, which is the failure mode that matters here: **this is the one citation in this corpus where following the wrong paragraph can cost the live domain.** A reader sent to `:165-176`, finding a section about publishing staging and no trap warning, could reasonably conclude the trap had been resolved and dispatch the `production` job.

That is why the anchors are not repaired with better line numbers. `docs/AGENT_WORKFLOW.md` §4 states the rule this instance pays for: *"A `file:line` into a document under active edit is the least durable citation here; a quoted sentence is the most."* `docs/DEPLOYMENT.md` is under active edit — the drift is 31 lines — so a quoted sentence and a section title are what survive the next insertion above them.

This note records the discrepancy; it does not resolve it. Which of the two Workers is *meant* to be production is an open decision for the owner (issue #274, Q9), so the deployment bullets above are deliberately left standing as the decision they are rather than rewritten to describe `lockstate-staging`. The live binding cannot be read from this repository at all — that same section says so itself, *"Nothing here can confirm that binding either … only Cloudflare → Workers → `lockstate-staging` → Settings → Domains & Routes shows the live state"* — so the operating state above is what that document records, not something this repository can verify.

### Amendment, 2026-09-03: the assets-only bullet is now false, and this is the commit it went false in

*This amends the Decision bullet **"Deploy the current application as an
assets-only Worker with no application-server entry point"**. Status is
untouched: this ADR remains **Accepted**. **The decision to add the entry point
is the owner's**, taken on 2026-09-03 in their own words and recorded in
`AGENTS.md`'s "The owner's standing mandate"; the wording of this section and
every consequence drawn in it are this editor's under that decision. A reader
who disagrees with a consequence should treat that consequence as open — the
decision itself is not.*

**What is now true.** `wrangler.jsonc` declares `main`, so this deployment is
no longer assets-only. The bullet is left standing above rather than
overwritten, on this ADR's own precedent: the operational note directly above
records a state of the world beside a decision instead of rewriting the
decision, and `docs/adr/README.md`'s *"An amendment to an accepted ADR"*
section requires the dated-heading form this section takes.

**Which sentence went false, and which did not.** `docs/DEPLOYMENT.md`'s "What
this does to ADR 0002, and when" worked this out before the change existed, and
its conclusion holds on inspection:

- The rejected alternative **"Add a Worker server entry point now"** is
  honoured rather than overturned. It was rejected because *"no trusted server
  behavior is currently required. A placeholder server would add routing and
  security surface without product value."* What arrived is not a placeholder:
  the entry point carries the telemetry ingest, which is the product value that
  rejection said was missing. The word that dated is *"currently"*.
- The **Decision bullet does go false**, and it goes false in the commit that
  adds `main` — not on 2026-08-27, when the owner decided the order, and not
  earlier on 2026-09-03, when they authorised the merge. Amending it before
  that commit would have put this document ahead of the code.
- **Two Decision bullets are unaffected, and were checked rather than
  assumed.** `assets.not_found_handling` is still `single-page-application` in
  all three environments, and `assets.directory` is still generated by the Vite
  plugin rather than hard-coded. `scripts/verify-cloudflare-build.mjs` asserts
  both on the built output.
- `docs/DEPLOYMENT.md`'s Contract paragraph — *"a server-side Worker entry
  point must not be added merely to serve the SPA"* — survives untouched. An
  ingest handler is not that.

**What the entry point does to the topology this ADR decided**, stated because
it does not follow from `main` alone: `assets.run_worker_first` is `true`, so
the Worker is in front of **every** request to the domain, each fingerprinted
`/assets/*` file included. It has to be. `single-page-application` handling
makes the asset router match every path it is asked about, so under the default
assets-first routing a Worker script would never be reached at all. The handler
answers one configured path and returns every other request to the assets
binding unchanged, and with no ingest path configured — which is every
environment in `wrangler.jsonc` — it answers nothing and claims nothing.

**What is not amended.** No cache bullet, no header bullet, no environment
bullet, and nothing about production publishing. The `public/_headers` bullet
in particular still describes what governs every asset response, because those
responses still come from Static Assets. What it does *not* reach is a response
the Worker writes itself, so the ingest handler sets its own headers; that is a
new fact about a new surface rather than a change to this decision.

## Alternatives considered

### Cloudflare Pages

Rejected as the primary target. Workers Static Assets is the intended long-term runtime and avoids a later Pages-to-Workers migration.

### Plain Vite static hosting with a manually configured output directory

Rejected because the official Vite plugin provides production-like local behavior in `workerd` and generates the deployment configuration that points to the correct client output.

### Dashboard-only domain and routing configuration

Rejected as the normal operating model. Wrangler configuration is the source of truth and later deployments can replace dashboard-defined routes. The Cloudflare zone still has to be owned and free of conflicting DNS or Worker configuration.

### Add a Worker server entry point now

Rejected because no trusted server behavior is currently required. A placeholder server would add routing and security surface without product value.

### Automatic production deployment on every merge

Deferred. Production releases require a separate decision about protected environments, Cloudflare credentials, approval, release evidence, rollback ownership and future save-schema compatibility.

## Consequences

Positive:

- Development, preview and deployment use the same supported Cloudflare/Vite integration.
- Deep-link routing, domain ownership and cache behavior are explicit and testable.
- Staging and production are distinct Workers with distinct public exposure.
- Future trusted APIs can be added behind a later ADR without replacing Static Assets delivery.
- Production publishing remains deliberate and credential-isolated.

Costs:

- Environment selection must occur during every build, not only at deployment time.
- CI performs two environment-specific builds and Wrangler dry-runs.
- Domain ownership and the future `www` redirect remain operational prerequisites outside the repository.
