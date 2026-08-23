# ADR-0012: Art storage, generated-versus-source policy and runtime asset delivery

- Status: Proposed
- Date: 2026-08-23
- Related: issue #32, [ADR-0002](./0002-cloudflare-static-assets.md), [`docs/ART_PIPELINE.md`](../ART_PIPELINE.md)

## Context

Issue #32 flags that "source files may be large and need an explicit
repository/LFS/storage policy before adoption", and that "fingerprinted deploy
assets can use immutable caching while manifests/version pointers remain
update-safe". The art pipeline landed in `e3eb4a3` without either decision being
recorded, so both were made implicitly by implementation:

- `.gitattributes` routes `assets/source/**/*.png`, `assets/source/**/*.blend`,
  `public/assets/**/*.png` and `public/game-content/**/*.png` through Git LFS.
  Nothing in CI or the docs stated that this is the policy, that CI does not
  fetch LFS content by default, or what a contributor should do when adding a
  new binary type.
- Runtime atlases are published from `public/`, which Vite copies verbatim
  without fingerprinting, while `public/_headers` granted
  `max-age=31536000, immutable` to everything under `/assets/*`. Re-rendering an
  atlas reused the same URL, so a returning player could hold a stale sprite for
  a year, and the atlas manifests — the version pointers meant to signal that the
  art changed — were immutably cached along with it.
- The production bundle is 55 MB, of which 36 MB is `public/game-content/source-art/`:
  the 23 owner-supplied intake sheets. `docs/ART_PIPELINE.md` describes these as
  source reference material awaiting a reviewed extraction manifest, and no
  runtime code loads them.

These are architectural decisions with deployment, cost and cache-correctness
consequences, so they belong in an ADR rather than in a `_headers` file and a
`.gitattributes` line.

## Decision

### Storage

- Large binary art is tracked with Git LFS. `.gitattributes` is the single
  declaration of which paths that covers, and adding a new binary asset type
  means extending it in the same commit.
- `assets/source/` holds authoring inputs — Blender scenes and intake sheets.
  It is never loaded at runtime and is never published.
- `assets/intermediate/` holds render frames and is git-ignored.
- Generated runtime batches are committed, because the upstream Blender render
  step cannot run in CI. What ships is therefore exactly what was reviewed.

### Verification

- Runtime atlases are validated against the authored contract in
  `assets/contracts/` by `tooling/validate-runtime-atlas.mjs`, exposed as
  `pnpm verify:assets` and run in CI as a required `assets` job.
- That job is the only one that checks out LFS content (`lfs: true`). The main
  `verify` job stays on a pointer-only checkout so ordinary runs do not consume
  metered LFS bandwidth.
- Because a pointer-only checkout is the normal case, the validator recognises a
  Git LFS pointer and fails naming it, rather than treating an unfetched file as
  valid art. A gate that cannot tell the difference is worse than no gate. The
  job additionally asserts the PNG signature and a size floor on every atlas
  before validating, so the log carries positive evidence that image bytes
  materialised rather than only the absence of a failure.
- The `git-lfs` binary is provisioned by `scripts/provision-git-lfs.sh`, run in
  the `verify` job, and `assets` declares `needs: verify`. This ordering is
  forced: `actions/checkout` is the first step of its own job, so a job cannot
  install the binary its own `lfs: true` checkout depends on. A runner missing
  it fails the checkout in seconds before any other step can help. Provisioning
  it in the job before is the only shape that both keeps the simple `lfs: true`
  checkout and lets a from-scratch runner heal itself, and it mirrors
  `scripts/provision-postgres.sh` (PR #54) rather than inventing a second
  pattern. It also stops the asset job spending LFS bandwidth on a build that is
  already failing.
- Known limitation: this heals a rebuilt runner because the self-hosted pool is
  a single machine, so `assets` lands where `verify` provisioned. If the pool
  grows, `git-lfs` belongs in the runner image and the `needs:` edge becomes an
  optimisation rather than a prerequisite. Until then the failure mode is loud
  and names the missing binary, not silent.

### Delivery and caching

- ADR-0002's immutable caching applies to fingerprinted names only. A path whose
  filename does not change when its bytes change must not be served
  `immutable`.
- `public/_headers` rules are exclusive rather than layered: overlapping rules
  concatenate into one `Cache-Control` header instead of overriding each other,
  which produced `max-age=31536000, immutable, max-age=300, must-revalidate`.
  `/assets/:file` therefore scopes the fingerprinted-Vite rule to a single path
  segment.
- Non-fingerprinted runtime art (`/assets/actors/*`), including its atlas
  manifests and `asset-registry.json`, revalidates.
- Content-hashed source art (`/game-content/source-art/*`) is cached immutably;
  the mutable catalog `source-art.v1.json` beside it is not.
- `scripts/verify-deployment-preview.mjs` asserts this against the real workerd
  preview, including that no response carries two cache lifetimes.

### Runtime access

- Runtime code resolves logical asset IDs through the generated registry and
  manifests (`src/rendering/assets/`), never through a filename. Manifests are
  parsed through Zod at load time and fail closed.

## Open question deliberately left unresolved

Whether `public/game-content/source-art/` should be published at all. It is
36 MB of the 55 MB bundle, nothing loads it, and `docs/ART_PIPELINE.md` calls it
intake material. Moving it out of `public/` would cut the deploy payload by two
thirds, but it is art owned by the pipeline that produced it, and removing it is
a content decision rather than a delivery one. This ADR records the cost and
leaves the call to the art owner; until then its caching is at least correct.

## Alternatives considered

### Store art outside Git (Supabase Storage or an object bucket)

Rejected for now. LFS keeps the reviewed batch atomic with the code that
consumes it, so a checkout of any commit yields a coherent pair. Revisit if LFS
bandwidth or repository size becomes the binding constraint; the manifest
indirection in `src/rendering/assets/` means the runtime would not have to
change.

### Fetch LFS content in the main `verify` job

Rejected. Only the atlas validator needs image bytes, and paying LFS bandwidth
on every ordinary CI run to serve one check is the wrong trade.

### Fingerprint runtime art by moving it under `src/`

Deferred. It would let Vite hash the filenames and restore blanket immutable
caching, but it moves the packer's output location and belongs with whoever owns
the pipeline. Revalidating headers make the current layout correct in the
meantime.

### Leave the caching as it was and rely on a deploy-time purge

Rejected. `immutable` instructs the client not to revalidate at all, so an
origin purge does not reach a browser that already cached the response.

## Consequences

Positive:

- The storage policy is declared, testable and discoverable rather than implied
  by one contributor's local LFS setup.
- Asset validation is a required gate, and cannot pass vacuously on a
  pointer-only checkout.
- Cache behaviour matches what each URL can actually promise, and a regression
  fails `pnpm verify:deployment`.

Costs:

- CI runs an extra job and pays LFS bandwidth on it.
- Runtime art is revalidated rather than served from cache without a request.
  That is one conditional request per atlas per five minutes, which is the
  correct price for being able to ship new art at all.
- The deploy payload stays at 55 MB until the open question above is settled.
