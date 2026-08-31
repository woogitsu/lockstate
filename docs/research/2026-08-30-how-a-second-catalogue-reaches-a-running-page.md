# How a second message catalogue reaches a running page

**2026-08-30.** Answers [#662](https://github.com/matmaxalez/lockstate/issues/662).
Every number below came from `node scripts/cloudflare-task.mjs build production`
run in a worktree at `origin/main` `898a16a` (v0.0.252), with the emitted files
measured by `stat -c%s` and `gzip -9 -c … | wc -c`. The reproduction recipe is
§8; anyone can re-run it against the real Polish catalogue when
[#661](https://github.com/matmaxalez/lockstate/issues/661) produces one.

## Claim tiers

`docs/research/README.md` labels every claim. Everything here is **VERIFIED**
in the first-party sense: a byte count taken off a file this build wrote, or a
`file:line` in this repository that was opened and read. **SEARCH-SUMMARY and
FROM MEMORY do not occur.** Two **UNKNOWN**s are marked inline (§6), each with
what would settle it.

---

## 1. The answer

**Route 3 — a dynamic `import()` of a code-split chunk.** It is the only one of
the three that needs nothing from the owner, and the thing that makes it free is
measurable rather than aesthetic: the chunk Vite emits lands at
`/assets/<name>-<hash>.js`, which the `_headers` rule that already exists
matches exactly.

It also does not need ADR 0011 amended. ADR 0011 asks for a catalogue
*"validated on load and addressed by a versioned URL"* which *"load[s]
asynchronously and merge[s] over"* the bundled default. A content-hashed chunk
URL **is** a versioned URL; the load is asynchronous; the validation is
unchanged. Route 3 satisfies the ADR as written. **Route 1 is the one that would
need it amended**, and that is the owner's.

## 2. The starting state, verified rather than assumed

```
$ grep -rn "MessageCatalogLoader" src/ | grep -v "catalog.ts"
$ echo $?
1
```

Empty, re-checked on 2026-08-30. `src/services/localization/catalog.ts:95`
declares `MessageCatalogLoader`, `:99` `LoadedCatalogResult`, `:104` the async
`loadMessageCatalog(loader, locale)`. Nothing implements the interface, and
`src/main.ts:1076` builds the page's one localizer from the bundled English
catalogue alone:

```ts
const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
```

The bundled catalogue is 579 keys, 2 of them plural-form objects, 31,968 bytes
of minified JSON.

## 3. What was measured with

No Polish translation exists yet — #661 is writing the candidates, and this
work stayed out of `src/content/` and out of any `pl` catalogue file. **So the
second catalogue used for every measurement below is the English one
re-tagged `pl`**: same 579 keys, same 31,968 bytes. That is a *lower* bound on a
real one, because Polish runs longer than English and its diacritics cost extra
UTF-8 bytes.

The upper bracket is measurable without a translator. `buildPseudoLocaleCatalog`
already expands the default catalogue by 35 % and accents every letter, which is
deliberately worse than any real translation:

| Second catalogue | raw JSON | gzip -9 |
| --- | --- | --- |
| English re-tagged `pl` (lower bound) | 31,968 | 8,788 |
| 35 %-expanded, fully accented (upper bracket) | 56,083 | 11,560 |

So "one more locale" is **8.8–11.6 kB gzipped of data**, wherever it is put. The
routes differ in *who pays for it and when*, not in how big it is.

## 4. The three routes, built and measured

Baseline, `origin/main` `898a16a`, unmodified:

```
dist/assets/index-C-dzaCON.js   raw 1,758,558   gzip -9 456,287
```

There is exactly one client JavaScript chunk on `main` today: the build emits
`index-*.js` and `worker-*.js` and nothing else. That mattered for route 3 and
is why it was measured rather than assumed.

| Route | main chunk (raw / gzip) | Δ main chunk | second file emitted |
| --- | --- | --- | --- |
| baseline | 1,758,558 / 456,287 | — | — |
| **1. bundle it too** | 1,790,575 / 464,861 | **+32,017 / +8,574** | none |
| **2. static asset + `fetch`** | 1,758,786 / 456,393 | +228 / +106 | `dist/locales/pl.v1.json`, 31,968 raw (8,788 gzip) |
| **3. dynamic `import()`** | 1,759,942 / 456,920 | +1,384 / +633 | `dist/assets/measurement-pl-CfG6d1_J.js`, 31,982 raw / 8,810 gzip |
| **3b. `import()` of a `.json`** | 1,759,924 / 456,912 | +1,366 / +625 | `dist/assets/measurement-pl-B5nPVFj3.js`, 32,058 raw / 8,862 gzip |

Read the first-page cost off the `Δ main chunk` column, because that is what
every player downloads before the game starts:

- **Route 1 costs +8,574 bytes gzipped on every load, for every player,
  forever, per locale** — +1.88 % of the current 456 kB. With the upper bracket
  it is nearer +11.6 kB. It is not a catastrophe at one locale; it is a slope,
  and it is the slope ADR 0011 declined.
- **Route 3 costs +633 bytes gzipped on the first page**, and the catalogue's
  8.8 kB is fetched only when a player asks for Polish.

`dist/index.html` in the route-3 build names one script and no `modulepreload`:

```html
<script type="module" crossorigin src="/assets/index-B_CDMWx-.js"></script>
<link rel="stylesheet" crossorigin href="/assets/index-Bk9vYhHn.css">
```

So the chunk is genuinely not requested until the `import()` runs. That was the
claim most worth checking, because a bundler that emits a chunk and then
preloads it has cost you the split.

## 5. Why route 3 needs nothing from the owner and route 2 does

`public/_headers` has four rules. The relevant one:

```
/assets/:file
  Cache-Control: public, max-age=31536000, immutable
```

`:file` matches **one** path segment, which is why the file's own comment says
it covers *"the fingerprinted files Vite emits directly into /assets/ without
also matching the /assets/actors/ subtree"*.

- Route 3's chunk is `/assets/measurement-pl-CfG6d1_J.js`: one segment,
  content-hashed. **The existing rule already gives it a one-year immutable
  cache**, and `docs/DEPLOYMENT.md` line 495 (*"Vite emits content-hashed files
  directly into `/assets/`"*) is the same statement from the other side. Nothing
  in `public/_headers`, `.github/workflows/deploy.yml` or `wrangler.jsonc`
  changes.
- Route 2's asset is `/locales/pl.v1.json`, which matches **none** of the four
  rules. `docs/DEPLOYMENT.md` line 504 already anticipates precisely this file:
  *"A mutable stable-name file under `/assets/` therefore needs either its own
  exclusive rule or its own versioned URL and cache contract — that applies to
  future large game-content manifests, **localization bundles** and downloadable
  data packs."* Writing that rule is deploy configuration, which is the owner's
  (`AGENTS.md`, "The owner's standing mandate", exclusion 3). **So route 2 is
  not chosen here.**

What route 2 would buy for that: **74 bytes on the wire** (8,788 gzipped JSON
against an 8,862-byte gzipped JSON-module chunk). That is the whole difference.

**If the owner wants route 2 anyway, this is the exact change and nothing here
makes it:** a new exclusive block in `public/_headers` — the rules concatenate
rather than override, so it cannot overlap `/assets/:file` — giving
`/locales/*` either `max-age=31536000, immutable` if the filename carries the
version (`pl.v1.json`, `pl.<hash>.json`), or a revalidating policy in the shape
of the `/assets/actors/*` rule if it does not. `pnpm verify:deployment` would
need the corresponding assertion, since it already asserts both directions for
the two existing cache classes.

The Content-Security-Policy needs no change for either route: `script-src
'self'` covers a same-origin dynamic import, `connect-src 'self'` covers a
same-origin fetch.

## 6. What route 3 costs, stated rather than waved away

#662 names the real objection: *"the catalogue becomes code rather than data,
which changes how it is validated."* Three things, honestly:

1. **It does not change how it is validated.** The chunk's default export is a
   plain object literal; `switchLocale` hands it to `loadMessageCatalog`, which
   hands it to `decodeMessageCatalog`, byte-for-byte the same untrusted value a
   `fetch(...).json()` would produce. §7's tests exercise that path through a
   real `import()`, not a stub. And **`import()` of a plain `.json` file
   code-splits identically** (row 3b above), so the catalogue can be *authored*
   as JSON and still travel this route — which is the handover to #661.
2. **An `import()` executes its chunk; a JSON body is inert.** That is a genuine
   difference and the honest form of it is: the chunk is produced by this
   repository's own build, served same-origin under `script-src 'self'` from a
   content-hashed immutable URL. An attacker who could substitute that file
   could substitute `index-*.js`, which is 1.7 MB of the same trust level. The
   marginal exposure is nil, and it would not be nil if the chunk could ever be
   fetched cross-origin — it cannot.
3. **Offline.** Route 1 is the only one that has a translated string with the
   network off on first switch. Routes 2 and 3 are identical here, and there is
   **no service worker in this repository** (`grep -rn "serviceWorker" src/
   index.html public/` is empty), so no route has an offline story today beyond
   the HTTP cache. After the first successful switch, route 3's chunk is
   `immutable` for a year and route 2's asset has whatever policy the owner
   writes.

**UNKNOWN — what Cloudflare actually serves on the wire.** Every gzip figure
here is local `gzip -9`. Cloudflare compresses responses itself, likely with
Brotli, and this repository cannot read that back (`docs/DEPLOYMENT.md`: the
domain binding *"is therefore not reproducible from this repository"*).
Settled by `curl -H 'Accept-Encoding: br' -I` against a deployed URL. It moves
all four rows in the same direction, so it does not change the ordering.

**UNKNOWN — whether a failed `import()` can be retried.** A rejected dynamic
import may be memoised by the module system, in which case a player who switches
to Polish while a tunnel eats the request could be stuck in English until
reload. Settled by a browser test that fails one request and then succeeds. It
does not change the choice — route 2 has the mirror-image question about a
cached failed `fetch` — but a language picker built on this should know the
answer before it offers a "try again".

## 7. The prototype, and the three states demonstrated

`src/services/localization/chunk-catalog-loader.ts` is **a prototype**. It is
exported from the barrel and **nothing in `src/main.ts` uses it**; the build
above confirms the cost of that is zero, since the route-3-less build with the
prototype present is byte-identical to the baseline at 1,758,558 raw. It has
three pieces:

- `CatalogChunkImporter` — `() => import('./catalogs/pl.json')`, a **thunk**, so
  the chunk is requested on switch and not at module evaluation. A map of live
  promises would download every locale at boot and undo the split.
- `createChunkCatalogLoader(importers)` — the missing `MessageCatalogLoader`.
  Normalizes registered tags, refuses an invalid one loudly at construction
  (a registry typo is a build mistake, not a player-facing failure), and unwraps
  the module namespace's `default` so `decodeMessageCatalog` keeps seeing the
  same plain value whatever route delivered it.
- `switchLocale(current, loader, locale, { onFailure })` — returns the localizer
  to render with. **On any failure it returns the caller's own instance,
  unchanged**, plus a report. Returning to the bundled default performs no load
  at all.

`tests/unit/localization-chunk-delivery.test.ts`, 11 tests, driving real
`import()`s of real files in `tests/fixtures/localization/`:

| #662 asks for | test | what it asserts |
| --- | --- | --- |
| the catalogue loads and text changes | `state 1` | `ui.start` → `Rozpocznij`; `formatPlural('ui.prisoners', 5)` → `5 więźniów` (Polish rules, Polish forms); a key Polish lacks still falls back per key to `Fallback only` |
| it fails to load, UI stays English, failure reported | `state 2` | importer rejects; `outcome.localizer` **is** the previous instance; `onFailure` receives one report; `ui.start` still renders `Start`, not the raw key |
| a bad version is refused, not partially applied | `state 3a` | `version: 2` fixture; `ui.only-in-bad-catalog` — a well-formed key inside the refused catalogue — does not resolve |
| a schema violation is refused, not partially applied | `state 3b` | one key's plural object is missing its mandatory `other`; the whole catalogue is refused, including its valid keys |
| — | `state 3c` | a catalogue declaring `de` when `pl` was requested is refused |

The three invariants #662 names, and where each is actually enforced:

- **`decodeMessageCatalog`** is on the path for every route, because
  `switchLocale` goes through `loadMessageCatalog`
  (`src/services/localization/catalog.ts:104`), which calls it.
- **`MESSAGE_CATALOG_VERSION`** is enforced by `z.literal(MESSAGE_CATALOG_VERSION)`
  in `messageCatalogSchema` (`catalog.ts:32`); `state 3a` is that check firing.
  Route 3 gives it a second, independent guard — the chunk's URL is
  content-hashed and named by the (also hashed) main chunk, so a stale cached
  catalogue cannot be served in the first place. The field is what would make a
  future *stored* catalogue (IndexedDB, a service worker cache) safe, and it
  keeps working on this route.
- **Silence, not a crash.** No path in `chunk-catalog-loader.ts` throws after
  construction. `buildLocaleFallbackChain` then does the rest: the localizer
  returned on failure is the English one, so every key resolves.

**Red-then-green.** Four mutations of the production code, each run and watched:

| mutation | result |
| --- | --- |
| failure returns `current.withLocale(requested)` instead of `current` | `5 failed \| 6 passed` |
| skip `loadMessageCatalog`, trust the module because "it came from us" | `4 failed \| 7 passed` |
| `unwrapCatalogModule` returns the namespace instead of `.default` | `3 failed \| 8 passed` |
| delete the "default locale needs no load" branch | `1 failed \| 10 passed` |

Unmutated: `Tests 11 passed (11)`. `tsc -b --pretty false` exits 0.

### The trusted-services no-I/O boundary is preserved, and one gate has a hole

`docs/CONTENT.md` says of this layer: *"nothing yet fetches a catalog.
`MessageCatalogLoader` is an interface, and the trusted-services layer performs
no I/O at all."* **Both halves are still true after this change**, and
deliberately so: `chunk-catalog-loader.ts` never writes an `import()` of its
own. It takes the thunk from its caller, exactly as storage reaches this layer
only through an injected `KeyValueStore`. The composition root owns the I/O; the
port owns the validation. `tests/unit/services-layer-boundaries.test.ts` passes
unchanged, 13 tests.

**Handed over, because it is outside this issue's surface:** that gate would not
have caught it either way. Its `IO_SOURCES` list covers `fetch`,
`XMLHttpRequest`, `navigator.sendBeacon`, `WebSocket`, `EventSource`,
`indexedDB`, `sessionStorage` and `caches` — and has **no pattern for a dynamic
`import()`**, which is a network fetch in a browser. A future module under
`src/services/` that imported a catalogue chunk directly would leave that file
green while making its central claim false. Adding the pattern is a one-line
change to a test this work did not otherwise touch.

### What remains before this is the shipping path

1. A `pl` catalogue to point an importer at (#661). Authored as `.json` is fine
   and is measured above.
2. The importer registry and the wiring in `src/main.ts` — the localizer at
   `:1076` is a `const` read by the HUD and the save panel, so switching locale
   means the page needs a way to *re-render* with a new `Localizer`, which is
   the language-picker issue and not this one.
3. `onFailure` wired to something a human sees or a counter records, in the
   shape `onMissingKey` already has.
4. A `tests/browser/` case for the real network failure, which is the only layer
   that can answer §6's second UNKNOWN.
5. A completeness gate for a non-default locale — deliberately **not** added
   here. `tests/foundation/localization-key-completeness.test.ts` requires every
   declared key to resolve in the default catalogue; a second locale is allowed
   to be partial by design (fallback is per key), so the gate for it is a
   different one and needs deciding, not copying.

## 8. Reproducing the measurements

In a worktree at `898a16a`, with `node_modules` symlinked (`pnpm <script>`
aborts in a worktree):

```sh
# baseline
node scripts/cloudflare-task.mjs build production
for f in dist/assets/*.js; do echo "$f raw=$(stat -c%s $f) gzip=$(gzip -9 -c $f | wc -c)"; done

# a second catalogue to measure with: the English one, re-tagged
node -e '…' # dump defaultMessageCatalogEn to JSON, set locale to "pl"

# route 1  — import the catalogue statically in src/main.ts and pass it to `new Localizer`
# route 2  — write it to public/locales/pl.v1.json and fetch('/locales/pl.v1.json')
# route 3  — src/services/localization/measurement-pl.ts, awaited by `import(...)`
# route 3b — src/services/localization/measurement-pl.json, awaited by `import(...)`
# ...rebuilding and re-measuring after each, then `git checkout src/main.ts`
```

Each variant must be reachable from a value the bundle actually uses, or
tree-shaking removes it and the delta reads as zero — that is the trap
`vite.config.ts`'s `assertContentValidationIsShipped` plugin exists because of
(#315), and it is the reason the prototype's own zero-byte delta in §7 is a
result rather than a mistake. Baseline reproduces exactly: after deleting every
fixture the build re-emitted `index-C-dzaCON.js` at 1,758,558 bytes, the same
hash and the same size as the first run.

## 9. The weakest claim

**That 8.6 kB gzipped is a cost worth routing around.** Route 1 is one import
and no moving parts, and +1.88 % of the first-page download is not a number
that would fail a review on its own. The case against it is a slope and a
document: the cost is linear in locales and permanent, and ADR 0011 took a
position against it that route 3 does not require anyone to revisit. If the
owner would rather have the simplest possible thing at two or three locales and
amend ADR 0011, the measurements above are the input to that decision and the
9 kB is the price — **that call is the owner's, because it is an Accepted ADR.**

What would change my mind: a measurement showing Vite stops emitting the
catalogue as its own chunk under some future config (§8's recipe catches this in
one build); or a decision to ship a service worker, which changes the offline
comparison in §6 in route 1's favour and would want re-running.
