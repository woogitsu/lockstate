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
