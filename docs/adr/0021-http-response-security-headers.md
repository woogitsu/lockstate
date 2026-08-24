# ADR-0021: HTTP response security headers for the static-asset deployment

- Status: Proposed — pending human approval
- Date: 2026-08-24
- Related: issue #105 (finding 12), issue #138 (item 3), [ADR-0002](./0002-cloudflare-static-assets.md), [ADR-0008](./0008-trusted-service-boundary.md), [`docs/DEPLOYMENT.md`](../DEPLOYMENT.md), [`public/_headers`](../../public/_headers)

## Context

`public/_headers` set four security headers — `X-Content-Type-Options`,
`X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` — and nothing else.
Issue #105 finding 12 records the gap:

> LOW — `public/_headers` sets **no CSP**, no HSTS, no cross-origin isolation,
> and only `nosniff` is asserted anywhere — by a script no workflow runs.
> Notable because Phaser 4.2.1 is 1.6 MB of unaudited bundled code and is the
> residual reason to want a CSP, given `src/` itself has no injection sink.

Two of the three clauses in that sentence have since become false and are
recorded here as corrected rather than quietly dropped:

- **"only `nosniff` is asserted anywhere"** — #153 added
  `SECURITY_HEADER_BASELINE` covering all four, and #160 added the reverse
  inclusion in `tests/foundation/ci-configuration-contract.test.ts`.
- **"by a script no workflow runs"** — `.github/workflows/ci.yml:97` runs
  `pnpm verify:deployment`, which runs `scripts/verify-deployment-preview.mjs`.

The remaining clause — no CSP, no HSTS, no cross-origin isolation — was true,
and both #105 and #138 deferred it for the same stated reason: a CSP "has a
real chance of breaking Phaser and is its own change". This is that change, and
the decision it needs recording for is not "should there be a CSP" but **which
policy**, because a policy constrains what the renderer is permitted to do for
the life of the project.

### The fact that makes this decidable rather than speculative

`public/_headers` **is applied by a check that runs, and that CI gates.**
`vite.config.ts:6` loads `@cloudflare/vite-plugin`, so `vite preview` serves
`dist/` through workerd's Static Assets implementation — the same component
that serves production — and it honours `_headers`. Verified by execution: a
request to a preview origin returns every header the file declares, and the
runtime-art rule still yields exactly one `Cache-Control` lifetime.

That is what makes a CSP for this repository verifiable rather than a guess
shipped blind. The renderer's requirements below were measured by serving the
real production bundle through that stack and driving it with the real
Chromium, not by reading Phaser.

## Decision

`public/_headers` sets the following on `/*`, in addition to the four that were
already there.

```
Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'
Strict-Transport-Security: max-age=31536000; includeSubDomains
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

Enforcing, not `Content-Security-Policy-Report-Only`. Report-only was used to
*discover* the requirements — it is the only way to enumerate every violation
in one run instead of stopping at the first — and then discarded, because a
report-only policy with no reporting endpoint protects nothing at all.

### What the renderer actually needs — measured

The strict starting point was `default-src 'none'` with every fetch directive
narrowed to `'self'`, applied as `Content-Security-Policy-Report-Only` so the
app ran to completion and reported everything. Three distinct violation classes
came back, out of 37 events:

| Violated | Blocked | Source |
| --- | --- | --- |
| `script-src` | `eval` | `assets/index-<hash>.js:103:12482` |
| `img-src` | `data` | (no source; image load) |
| `img-src` | `blob` | (no source; image load) |

Each was then traced to a named line rather than attributed to "Phaser".

**`img-src blob:` is required, and its removal breaks every atlas.**
`node_modules/phaser/src/loader/filetypes/ImageFile.js:132` calls
`File.createObjectURL(this.data, this.xhrLoader.response, 'image/png')`, and
`File.js:583-587` sets `image.src = URL.createObjectURL(blob)`. That is not a
fallback: it is the only path Phaser's loader uses for a loaded image. Removing
`blob:` from the enforced policy produced ten `Refused to load the image
'blob:...' because it violates the following Content Security Policy directive:
"img-src 'self' data:"` errors and ten Playwright `requestfailed` events with
failure text `csp` — one per actor atlas.

**`img-src data:` is required, and its removal is an uncaught exception.**
`textures/TextureManager.js:206-216` installs `__DEFAULT`, `__MISSING` and
`__WHITE` from base64 data URIs during boot, and
`device/CanvasFeatures.js:30` probes canvas support with two more. Removing
`data:` produced four `Refused to load the image 'data:image/png;base64,…'`
errors and then an uncaught `TypeError: Cannot read properties of undefined
(reading 'glTexture')` — Phaser reaching for a texture that never materialised.

**`'unsafe-eval'` is NOT required, and Phaser is not what asked for it.** The
`eval` violation resolves to Zod, not Phaser: the bundle site is Zod 4's JIT
feature probe, `node_modules/zod/v4/core/util.js:145-162`, which does
`try { const F = Function; new F(''); return true } catch { return false }`.
The throw is caught; Zod sets `allowsEval` false and
`schemas.js:987` takes the interpreter path instead of the compiled fastpass.
So the violation is *reported* and no behaviour is broken. Independently,
`grep` over the production bundle finds zero occurrences of `new Function` and
zero of `eval(` besides that one probe, and Phaser's own code contributes
neither.

Nothing else was needed. There was **no** `style-src` violation — Phaser sizes
the canvas through CSSOM, which CSP does not govern — no `font-src`,
`media-src`, `connect-src` or `worker-src` violation, and `index.html` carries
no inline script or style, so `script-src 'self'` needs no nonce or hash.

Under the enforced policy the assembled application boots and runs: the canvas
is present at the viewport size, the HUD and save panel mount, and with the
atlases present as real image data every one of them loads and decodes with no
CSP error at all. The main-thread ↔ simulation-worker round trip was checked
separately rather than inferred from the absence of a `worker-src` violation: a
prison created through the UI advances the HUD clock from `Day 1 … 0%` to
`Day 1 … 4%` while the policy is enforced, with zero page errors.

### The one cost of withholding `'unsafe-eval'`, measured

Losing Zod's JIT is a performance question, so it was measured rather than
asserted, on this repository's real `decodeSaveEnvelope` over a real
7,113-byte envelope (36 loaded chunks), 200 decodes per run, three runs each:

| | per decode |
| --- | --- |
| JIT available | 1.3812 ms, 1.1811 ms, 1.1721 ms |
| `jitless: true` | 1.2800 ms, 1.3202 ms, 1.2762 ms |

The ranges overlap: **there is no measurable cost** at this payload size,
because the envelope's validation is dominated by the `jsonValueSchema`
predicate walk, which Zod does not compile either way. This is a bound on the
shape measured, not a general claim about Zod: a wide, flat, deeply-typed
object is where the JIT pays off, and this schema is not that.

Therefore `script-src 'self'` is adopted. `'unsafe-eval'` would re-admit
string-to-code execution across the whole 1.6 MB bundle to buy back a
difference that does not show up.

### HSTS: `max-age=31536000; includeSubDomains`, and deliberately no `preload`

One year, matching the immutable asset lifetime already in the file, and
`includeSubDomains` because no `*.lockstate.io` subdomain exists —
`wrangler.jsonc` routes production at the `lockstate.io` custom domain and
staging on `workers.dev`, so the directive constrains nothing that exists
today. It does constrain the future: a subdomain later served over plain HTTP
would be unreachable for anyone who had visited the apex.

`preload` is **not** set, and that is a decision rather than an omission. It is
only meaningful after a submission to `hstspreload.org`, which is an owner
action outside this repository, and removal from the preload list is slow. A
header claiming `preload` while no submission exists would be a statement the
repository cannot back.

### Cross-origin isolation: yes, and it achieves something checked

`Cross-Origin-Opener-Policy: same-origin` plus
`Cross-Origin-Embedder-Policy: require-corp` were verified to actually isolate
the page rather than merely to be present: under them the document reports
`crossOriginIsolated === true`, `typeof SharedArrayBuffer === 'function'` and
`performance.measureUserAgentSpecificMemory` available. That matters for this
architecture specifically — AGENTS.md boundary 4 puts authoritative state in a
dedicated worker, and cross-origin isolation is the precondition for ever
handing that state across without copying it.

`require-corp` is the aggressive half and its cost is named rather than hidden:
any future cross-origin subresource — a CDN font, an embedded image, a
third-party script — is rejected unless it sends
`Cross-Origin-Resource-Policy: cross-origin`. Nothing today is cross-origin, so
the constraint is on future work, not on present behaviour. `credentialless`
was considered and rejected as the weaker option that buys nothing here: there
are no cross-origin resources to load without credentials.

`Cross-Origin-Resource-Policy: same-origin` on our own responses is the
complementary half — it stops another origin embedding them.

### `frame-ancestors 'none'` alongside `X-Frame-Options: DENY`

Deliberate duplication. `frame-ancestors` is what current browsers honour and
`X-Frame-Options` is kept for anything that only understands the legacy header.
Neither is redundant while both are cheap.

## Latent consequences

Stated separately, because each is a policy that is correct today and becomes
wrong on a specific future change.

1. **`connect-src 'self'` blocks Supabase the day cloud save is wired up.**
   No code in `src/` constructs a Supabase client:
   `src/persistence/cloud/supabase-client.ts:1` imports `SupabaseClient` as a
   type only and `:51` takes one by constructor injection, there is no
   `createClient` call in `src/`, and no `import.meta.env` read anywhere in
   `src/` — which is also why #105 found `@supabase/supabase-js` absent from
   the production bundle. So nothing makes a cross-origin request and
   `connect-src 'self'` is exactly right. When a client is constructed, this
   directive must gain the project origin, and the build-time environment
   variable means the value is not knowable from the repository alone. Whoever
   lands cloud save owns this line.
2. **`worker-src 'self'` blocks a `blob:` worker.** The current build emits
   `new Worker('/assets/worker-<hash>.js', …)`, a same-origin URL. Some Vite
   worker configurations emit a `blob:` shim instead; that build would fail
   under this directive. Observed incidentally while probing: a `blob:` worker
   created by hand on the page never starts.
3. **`img-src` does not permit an arbitrary remote origin.** Runtime art is
   served from the same origin under ADR-0014. Art served from a separate
   bucket or CDN would need this directive widened.
4. **There is no `report-to` / `report-uri`.** A violation in production is
   therefore visible only in the player's own console. Adding an endpoint means
   choosing a collector and accepting reports from the internet, which is its
   own decision with its own privacy consequences under ADR-0010.

## Consequences

- The renderer is constrained: no `eval`, no string-to-code, no remote script,
  no cross-origin subresource, no framing, no plugins. `src/` was already
  clean of injection sinks (#105 found zero `innerHTML`,
  `insertAdjacentHTML`, `outerHTML`, `document.write`, `eval` and
  `new Function` occurrences), so the policy's real subject is the 1.6 MB of
  third-party bundle that finding 12 named.
- One caught CSP violation is reported per page load, from Zod's JIT probe.
  Behaviour is unaffected. `z.config({ jitless: true })` would remove the
  probe entirely and make the interpreter path deliberate instead of
  CSP-dependent, but it is a `src/` change that also affects Node — where the
  JIT *is* available, so tests and benchmarks would change too — and it is
  therefore not made here.
- Nine headers are now asserted where four were. `SECURITY_HEADER_BASELINE`
  checks the values against a real workerd response;
  `tests/foundation/ci-configuration-contract.test.ts` pins the exact set of
  names on `/*`, which is the direction neither inclusion check could cover.
- **The CSP's runtime compatibility with the renderer has no standing gate.**
  It was established by execution for this change and nothing re-establishes
  it. A Phaser upgrade that began needing `'unsafe-eval'`, or a build that
  started emitting a `blob:` worker, would pass every check in this repository
  and break the page in production. Closing that needs a browser job that
  builds `dist` and drives `vite preview` — the browser suite today serves
  through `tests/browser/vite.config.ts`, which deliberately loads no
  Cloudflare plugin and therefore applies no `_headers` at all.

## Alternatives considered

- **Ship report-only first.** Rejected: with no reporting endpoint it is
  indistinguishable from having no policy, and the enforced policy was already
  demonstrated to work.
- **Allow `'unsafe-eval'` to keep Zod's JIT.** Rejected on the measurement
  above — the cost it buys back is not measurable at the payload sizes this
  project validates, and the concession applies to the entire bundle.
- **`script-src` with a nonce or hash.** Unnecessary: the built `index.html`
  contains no inline script or style, so `'self'` suffices and a nonce would
  add a build-time mechanism with nothing to attach it to.
- **Omit COEP.** Rejected: it was verified to break nothing and it is what
  actually delivers cross-origin isolation. COOP alone would not.
- **`Permissions-Policy` expansion.** Out of scope; the existing four
  allowlists are untouched by this ADR.
