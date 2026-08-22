# Cloudflare Workers Static Assets deployment

## Contract

Lockstate is delivered as an assets-only Cloudflare Worker through the official Cloudflare Vite plugin. The browser simulation remains client-side. No Node.js or PHP application server is required in production, and a server-side Worker entry point must not be added merely to serve the SPA.

Repository sources of truth:

- `wrangler.jsonc` defines Cloudflare environments, routing and SPA fallback.
- `vite.config.ts` enables `@cloudflare/vite-plugin` and disables public browser source maps.
- `public/_headers` defines the browser security and cache policy.
- `scripts/` contains cross-platform build, dry-run and smoke-test gates.

The Vite plugin creates a generated, flattened Wrangler configuration during `vite build`, including the actual client asset directory. Preview and deployment use that generated configuration through `.wrangler/deploy/config.json`. Do not hard-code `assets.directory` in the input configuration and do not commit `dist/` or `.wrangler/`.

## Environments

| Purpose | Cloudflare environment | Worker name | Public routing |
| --- | --- | --- | --- |
| Local development | top-level | `lockstate-development` | local Vite/workerd only unless deliberately deployed |
| Staging | `staging` | `lockstate-staging` | `workers.dev` and version preview URLs enabled |
| Production | `production` | `lockstate` | Custom Domain `lockstate.io`; `workers.dev` and preview URLs disabled |

The Cloudflare Vite plugin selects an environment at **build time** through `CLOUDFLARE_ENV`. Supplying an environment only to `vite preview` or a later `wrangler deploy` cannot change a configuration that was already flattened by the build. Repository scripts set the same environment for the build and every following Wrangler command.

## Local development

```bash
corepack enable
corepack prepare pnpm@11.22.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` uses the top-level development environment and the Workers runtime provided by the Vite plugin.

Run all repository and deployment gates without Cloudflare credentials:

```bash
pnpm verify
pnpm verify:deployment
```

`verify:deployment` performs production and staging builds, validates generated configuration, runs Wrangler dry-runs, and starts a local production-like preview. The smoke test verifies:

- `/` returns the Lockstate SPA shell;
- a direct deep route falls back to the same shell;
- HTML requires revalidation;
- security headers are present;
- a fingerprinted `/assets/*` file receives a one-year immutable browser cache policy;
- no public source map is included in deployable assets.

## Build and preview

Production:

```bash
pnpm build
pnpm preview
```

Build and open a fresh production preview in one command:

```bash
pnpm preview:production
```

Staging:

```bash
pnpm build:staging
pnpm preview
```

Or:

```bash
pnpm preview:staging
```

Dry-run packages:

```bash
pnpm deploy:dry-run:staging
pnpm deploy:dry-run:production
```

Dry-runs validate the generated deployment package and write ignored output below `.wrangler/dry-run/` without publishing it.

## Deployment

Staging:

```bash
pnpm deploy:staging
```

Production deployment is intentionally guarded. After staging and browser verification:

```bash
LOCKSTATE_PRODUCTION_DEPLOY=1 pnpm deploy:production
```

PowerShell:

```powershell
$env:LOCKSTATE_PRODUCTION_DEPLOY = '1'
pnpm deploy:production
```

Wrangler credentials must be supplied by the operator or a future protected release workflow, normally through `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Use a least-privileged token. Never store Cloudflare tokens, Supabase service-role keys or production secrets in the repository, frontend bundle, issue text or logs.

Ordinary CI validates packages but does not publish. A future deployment workflow requires protected environments, explicit production approval and a separate operational decision.

## Custom-domain prerequisites

Before the first production deployment:

1. The `lockstate.io` zone must be active in the Cloudflare account used by Wrangler.
2. The deployment token must be permitted to update the Worker and its Custom Domain.
3. Confirm that `lockstate.io` is not already attached to a conflicting Worker, origin or CNAME.
4. Run `pnpm deploy:dry-run:production` before authenticated deployment.
5. After deployment, verify HTTPS, `/`, a deep route and one fingerprinted asset.

Custom Domains match exact hostnames. This foundation intentionally declares only the canonical root hostname `lockstate.io`. Do not attach `www.lockstate.io` to a second Worker. When the canonical-host policy is accepted, create an appropriate proxied DNS record and Cloudflare Redirect Rule from `www` to the root hostname, then document it here.

Staging remains on `workers.dev`; protect it with Cloudflare Access before it contains non-public functionality or user data.

## Cache policy

Cloudflare Static Assets normally sends revalidation-safe HTML and asset headers (`Cache-Control: public, max-age=0, must-revalidate` with an `ETag`). Lockstate preserves revalidation for HTML and SPA fallback responses so new deployments are discovered promptly.

Vite emits content-hashed files below `/assets/`. `public/_headers` gives those fingerprinted files:

```text
Cache-Control: public, max-age=31536000, immutable
```

Do not place mutable stable-name files under `/assets/`. Future large game-content manifests, localization bundles or downloadable data packs require their own versioned URL and cache contract.

## Release checklist

1. Confirm the release branch is current and CI is green.
2. Run `pnpm install --frozen-lockfile`, `pnpm verify` and `pnpm verify:deployment`.
3. Deploy staging and perform a browser smoke test in a fresh uncached session.
4. Confirm the expected commit and generated asset hashes.
5. Deploy production using the explicit guard variable.
6. Verify `/`, a deep route, security headers and a fingerprinted asset on `lockstate.io`.
7. Record the deployed Worker version ID in release notes.

## Rollback
Every Worker deployment creates a version. List production versions and deployments:

```bash
pnpm exec wrangler versions list --name lockstate
pnpm exec wrangler deployments list --name lockstate
```

Roll back production to a reviewed version:

```bash
pnpm exec wrangler rollback <VERSION_ID> --name lockstate --message "Rollback: <reason>"
```

For staging, use `--name lockstate-staging`. The Cloudflare dashboard provides the same operation under the Worker's **Deployments** page.

A rollback creates a new deployment that points traffic to an earlier Worker version. It restores Worker code, Static Assets, bindings and compatibility settings captured by that version. It does **not** roll back external state in Supabase, KV, R2, D1 or other stores; future schema and data changes need independent recovery procedures.
