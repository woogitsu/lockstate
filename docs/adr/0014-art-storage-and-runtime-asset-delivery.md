# ADR-0014: Art storage, generated-versus-source policy and runtime asset delivery

- Status: Accepted
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
- That job materialises LFS content; the main `verify` job does not. `verify`
  stays on a pointer-only checkout so ordinary runs do not consume metered LFS
  bandwidth, which is safe because nothing `verify` needs the *contents* of is
  LFS-tracked: the atlas manifests, the authored contracts under
  `assets/contracts/` and `asset-registry.json` are all plain files, and the
  build only copies `public/` through verbatim. **This sentence previously gave
  its reason as "only `*.png` is LFS-tracked", which is false**:
  `.gitattributes:1-4` tracks `*.png` under three trees **and** `*.blend` under
  `assets/source/`, and six `.blend` files exist. The conclusion is unchanged —
  no `.blend` is read by any job — but the stated reason was an absolute that
  did not hold. (The later `browser` job
  pulls the same path-scoped subset, for the same reason `assets` does: the
  assembled page asks a real browser to decode the art. It reuses the objects
  `assets` already fetched into the shared workspace, so the second pull
  transfers nothing.)
- Because a pointer-only checkout is the normal case, the validator recognises a
  Git LFS pointer and fails naming it, rather than treating an unfetched file as
  valid art. A gate that cannot tell the difference is worse than no gate. The
  job additionally asserts the PNG signature and a size floor on every atlas
  before validating, so the log carries positive evidence that image bytes
  materialised rather than only the absence of a failure.
- The `assets` job does **not** use `actions/checkout` with `lfs: true`. It
  checks out plain, provisions the client with `scripts/provision-git-lfs.sh`,
  and fetches with an explicit `git lfs pull --include="public/assets/actors"`.
  Two measured reasons:
  - `lfs: true` does not work on a reused workspace. Checkout runs
    `git lfs fetch` and then relies on the following `git checkout` to smudge
    pointers into files. On a self-hosted runner the workspace is already at the
    target commit from the previous job, so the checkout is a no-op, the smudge
    filter never runs, and the objects sit downloaded-but-unused while the
    working tree keeps its 130-byte pointers. Observed in run 32637895668: the
    LFS fetch succeeded and every atlas was still a pointer.
  - `lfs: true` fetches every LFS object for the ref — all 55 MB, including the
    source sheets this gate never opens. The explicit pull takes a path filter
    and moves ~17 MB.
- Provisioning lives in the job that uses it, which is possible precisely
  because checkout no longer needs the binary at step one. A gate that depends
  on hand-installed runner state is not a gate; this mirrors
  `scripts/provision-postgres.sh` (PR #54) rather than inventing a second
  pattern.
- `assets` still declares `needs: verify`, now purely so a failing build does
  not spend metered LFS bandwidth.

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

## Amendment, 2026-08-27: "asserts this" covers two URLs out of a four-bullet list

*This amends **the last bullet of §"Delivery and caching"**. No decision moves,
and nothing in this ADR is false about `public/_headers`, `.gitattributes` or
CI — all three re-verify exactly, and that is recorded below. What is over-stated
is how much of §"Delivery and caching" the named verifier actually checks. The
form is ADR 0029's amendment and ADR 0034 §9's: the old wording is quoted rather
than overwritten.*

*Status is untouched: this ADR remains **Accepted**. Read at `792bf94`
(v0.0.121); every path and line below was opened on that tree, and the byte
counts were computed from the Git LFS pointers' own `size` fields rather than
from `du` on a pointer-only checkout.*

> **Corrected 2026-09-15: kept word for word, and read as a record of where this
> section was written from rather than as a date on its numbers.**
> `docs/adr/README.md`'s *"A global anchor pin in an ADR is advisory, and does
> not date what is below it"* — added by pull request #1231, not on `main` as
> this is written — is the convention; what follows is this document's own
> instance of it, swept 2026-09-15 by opening every cited line.
>
> - **The `.github/workflows/ci.yml` bullet has drifted wholesale**, every one
>   of its nine anchors, because that file has roughly doubled since. Re-aimed
>   in place below, old numbers kept as bare `:NNN`.
> - **Two `package.json` anchors have drifted** and are re-aimed with them.
> - **The byte counts and the file count have moved**, which the section below
>   predicted of itself in the words *"Four bare numbers across two paragraphs,
>   all currently right, all with nothing under them."* They are re-measured by
>   the same method rather than overwritten.
> - **`public/_headers`, `.gitattributes`, `.gitignore`,
>   `tooling/validate-runtime-atlas.mjs` and every anchor into
>   `scripts/verify-deployment-preview.mjs` re-verify exactly**, including the
>   whole of the amendment's own argument about what that script does and does
>   not check. The finding this amendment exists for is unaffected.
> - **`(v0.0.121)` is the working version string, not the tag.** `package.json`
>   reads `0.0.121` at `792bf94`, so the parenthetical is honest, but the tag
>   `v0.0.121` is `54418b6` and `792bf94` is fifty commits after it.

### The bullet, and the two requests it makes

§"Delivery and caching" ends:

> `scripts/verify-deployment-preview.mjs` asserts this against the real workerd
> preview, including that no response carries two cache lifetimes.

"this" reads as the four bullets above it. `assertRuntimeArtCachePolicy`
(`scripts/verify-deployment-preview.mjs:185-226`) builds a check list of
**two** entries and fetches exactly those:

- `/assets/actors/asset-registry.json`, asserted non-`immutable` and
  `must-revalidate` (`:189`, `:218-224`);
- the first `.png` under `dist/game-content/source-art/`, asserted `immutable`
  (`:193-199`, `:215-216`).

The "no response carries two cache lifetimes" assertion is real — `cacheControl`
must match `max-age=` exactly once (`:208-213`) — but it runs **inside that same
loop**, so it applies to those two responses and not to "no response".

Three things the bullets state are therefore asserted by nothing:

- **the `/assets/:file` rule** for Vite's fingerprinted output — the rule the
  second bullet exists for, and the one whose overlap with `/assets/actors/*`
  produced the concatenated header the bullet describes;
- **the atlas PNGs and manifests under `/assets/actors/`** other than
  `asset-registry.json`, which the third bullet names explicitly;
- **`source-art.v1.json`**, named in the fourth bullet as the mutable catalog
  that must *not* be immutable. It sits at
  `public/game-content/source-art.v1.json` — beside the directory, not inside it
  — so `/game-content/source-art/*` (`public/_headers:75`) does not match it and
  **no rule in `public/_headers` matches it at all**. Its non-immutability today
  is an accident of no rule matching, and a future `/game-content/*` rule would
  make it immutable without touching the sentence that says it is not.

**Label: TRUE-BUT-FRAGILE, not FALSE.** Both directions of the cache policy are
covered, which is what `docs/research/audit-2026-08-26/07-cicd-supplychain.md:51`
says and is accurate; what is over-claimed is coverage, and the cheapest fix is
to add `/game-content/source-art.v1.json` and one `/assets/actors/*.png` to the
check list rather than to soften the sentence.

### What was re-verified and is intact

Every other citation and count in this ADR holds at `792bf94`, re-run rather than
inherited:

- **`.gitattributes:1-4`** routes exactly the four patterns the Context lists,
  and `git ls-files '*.blend'` returns **6** — so the correction already recorded
  in §"Verification" (*"This sentence previously gave its reason as 'only `*.png`
  is LFS-tracked', which is false"*) is still both true and still the right
  reading. That correction is issue #274's finding A15 and it is **closed**; a
  refresher does not need to re-open it. The `six` is a bare count and is flagged
  as such, not corrected.
- **The Context's sizes.** `public/game-content/source-art/` holds **23** `.png`
  files totalling **35.8 MB**, and the ten LFS-tracked PNGs under
  `public/assets/` total **16.4 MB** — so "36 MB", "the 23 owner-supplied intake
  sheets" and "the explicit pull … moves ~17 MB" are all accurate. `public/` as a
  whole is **52.3 MB** with pointer sizes substituted, and a real
  `node scripts/cloudflare-task.mjs build production` at `792bf94` produces a
  `dist/` of **54.3 MB** by the same measure — so "the production bundle is
  55 MB" is right to within a megabyte, and "36 MB of the 55 MB bundle" in the
  open question is right as well. Four bare numbers across two paragraphs, all
  currently right, all with nothing under them.

  > **Re-measured 2026-09-15, and the paragraph above was right about itself.**
  > The figures are kept as what was true at `792bf94` and the new ones are set
  > beside them, because the sentence *"all currently right, all with nothing
  > under them"* is the finding and overwriting it would delete the
  > demonstration. By the same method — LFS pointers' own `size` fields, never
  > `du` on a pointer checkout — on `main`:
  >
  > | | at `792bf94` | 2026-09-15 |
  > | --- | --- | --- |
  > | `.png` files under `public/game-content/source-art/` | 23 | **26** |
  > | their total | 35.8 MB | **37.6 MB** |
  > | LFS-tracked PNGs under `public/assets/` | 10 | 10 |
  > | their total | 16.4 MB | **17.2 MB** |
  > | `public/` as a whole | 52.3 MB | **54.9 MB** |
  >
  > So the Context's *"the 23 owner-supplied intake sheets"* is now three sheets
  > short, and its *"36 MB"* and *"55 MB"* are still right to the megabyte they
  > are stated at. The `dist/` figure is **not** re-measured: Git LFS is
  > unprovisioned in this container, so `node scripts/cloudflare-task.mjs build
  > production` cannot produce a bundle whose bytes mean anything. That number
  > is therefore untested here rather than confirmed.
  >
  > The tally that broke is the one §4 of `docs/AGENT_WORKFLOW.md` predicts
  > breaks first, and it broke in the direction it predicts: **three sheets were
  > added and nothing touched the sentence counting them.**
- **`assets/intermediate/` is git-ignored** (`.gitignore:20`).
- **The CI job** is as described: `.github/workflows/ci.yml:200` declares
  `assets`, `:206` is `needs: verify`, `:210-223` records why it is deliberately
  not `lfs: true`, `:231` runs `scripts/provision-git-lfs.sh`, `:253` is
  `git lfs pull --include="public/assets/actors"`, and `:269` is the pointer
  check. The `browser` job (`:329`) does the same pull at `:377` and declares
  `needs: assets` at `:343`.

  > **Re-aimed 2026-09-15. Every structural claim in the bullet above still
  > holds and every number in it has drifted**, which is the pair worth seeing
  > together: nine anchors into one file, all stale, none of them the sign of
  > anything having gone wrong. `ci.yml` has grown by roughly its own length
  > since `792bf94`. Read at `main`:
  > `.github/workflows/ci.yml:348` declares `assets`, `:354` is `needs: verify`,
  > `:358-369` records why it is deliberately not `lfs: true`, `:379` runs
  > `scripts/provision-git-lfs.sh`, `:401` is the
  > `git lfs pull --include="public/assets/actors"`, and `:409` opens the
  > pointer-check step *"Confirm the runtime art is image data, not LFS
  > pointers"*. The `browser` job is at `.github/workflows/ci.yml:477`, declares
  > `needs: assets` at `:491`, and does the same pull at `:633`.
  >
  > **One thing beside that pull is new and is the reason this bullet is worth
  > re-reading rather than only re-numbering.** `:634` is a second
  > `git lfs pull --include=` whose value is a **literal list of specific
  > globs** under `public/game-content/source-art/`, one per rendered sprite
  > family. It is not a pattern over that directory: a sprite published there
  > and not named in that list arrives in the `browser` job as an LFS pointer,
  > and the decode assertion beside it fails on that pointer. Nothing in this
  > ADR said so, and §"Storage"'s rule — *"adding a new binary asset type means
  > extending it in the same commit"*, of `.gitattributes` — is now one
  > requirement short of what a contributor publishing a new sprite actually has
  > to do.
- **The validator** recognises a pointer (`tooling/validate-runtime-atlas.mjs:32`)
  and asserts the PNG signature (`:31`, `:60-61`).
- **`public/_headers`** is exclusive as described: `/assets/:file` immutable
  (`:61-62`), `/assets/actors/*` revalidating (`:70-71`),
  `/game-content/source-art/*` immutable (`:75-76`).
- **"a regression fails `pnpm verify:deployment`"** holds, and only through one
  indirection worth naming: `package.json:30` runs
  `scripts/verify-cloudflare-deployment.mjs`, which invokes
  `verify-deployment-preview.mjs` at its `:8`. And "the real workerd preview" is
  accurate rather than loose — `@cloudflare/vite-plugin` (`package.json:43`,
  `vite.config.ts:1`) is what makes `vite preview` serve `dist/` through workerd
  and apply `public/_headers`.

  > **Re-aimed 2026-09-15.** The indirection is unchanged and both ends of it
  > still resolve: `scripts/verify-cloudflare-deployment.mjs:8` is still the
  > line that names `verify-deployment-preview.mjs`, and `vite.config.ts:1` is
  > still the `@cloudflare/vite-plugin` import. The two `package.json` anchors
  > have moved four lines down the file: the `verify:deployment` script is at
  > `package.json:34` and the `@cloudflare/vite-plugin` dependency at
  > `package.json:47`. `:30` and `:43` are kept above as history.
- **The open question** is unchanged: nothing under `public/game-content/` is
  imported by any module in `src/`, so it is still 36 MB nothing loads.
