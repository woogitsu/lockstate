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
