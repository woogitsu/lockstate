# Localization: authoring guide and architecture

Localization is designed before content stabilizes so that English strings
never become identifiers. The decision record is
[ADR 0011](./adr/0011-localization-architecture.md); the runtime is
`src/services/localization/`, tested in
`tests/unit/services-localization.test.ts`.

## Three namespaces that never merge

| Namespace | Example | Where it lives | Reaches the player |
| --- | --- | --- | --- |
| Stable content/simulation id | `room.cell` | Saves, protocol, numeric-id catalogs | never |
| Message key | `room.cell.name` | Content definitions (`nameKey`), UI code | never |
| Translated text | "Cell" / "Cela" | Locale catalogs | always |

Rules:

- Simulation code may branch on a **stable id**. It may never read
  translated text, and no translated string may be persisted, hashed,
  checksummed or compared. A test keeps `src/simulation/` free of
  localization imports.
- Changing a stable id is a save migration. Changing a message key is a
  catalog change. Changing text is a routine translation update.
- Never use the English string as the key: a typo fix would break every
  other locale, and homonyms that translate differently would collide.

## Catalogs

A catalog is `{ version, locale, messages }`, validated on load. Values are
either a plain string or a plural-form object whose `other` form is
mandatory.

- The **default locale (`en`) is bundled** and must be complete, so the
  game always has text offline. `defaultMessageCatalogEn` composes the
  content-owned labels (`src/content/default-locale-en.ts`) with the
  service/UI strings.
- Every other locale is fetched through the `MessageCatalogLoader` port
  from its own versioned URL — `docs/DEPLOYMENT.md` forbids mutable
  stable-name asset paths.
- A catalog that fails validation, or declares a different locale than the
  one requested, is refused whole. The game keeps the previous or default
  locale rather than starting with half its text missing.

### How a second catalog actually arrives

`createChunkCatalogLoader` (`src/services/localization/chunk-catalog-loader.ts`)
is the port's implementation: a map of `() => import(...)` thunks, one per
locale, so a catalog is a code-split chunk requested when a player asks for
it and not before. The chunk lands at `/assets/<name>-<hash>.js` — one path
segment, content-hashed — which `public/_headers`' existing `/assets/:file`
rule already covers, so **no deploy configuration changes**. The measurements
behind that choice, including what the two rejected routes cost, are in
`docs/research/2026-08-30-how-a-second-catalogue-reaches-a-running-page.md`.

`switchLocale` is the call a language picker makes. It never throws and never
half-applies: on any failure it returns *the caller's own* `Localizer`, plus a
report through `onFailure`.

The port itself answers one question — give me the bytes for this tag. It
cannot answer *which* tags exist, which is what `selectSupportedLocale` has
always needed and what a picker has to render, so `ChunkCatalogLoader` adds
`locales` and `has()` beside it. Nothing in `src/main.ts` registers a locale
yet: that, and the re-render, are the language picker's work.

## Fallback

`buildLocaleFallbackChain('pt-BR')` → `['pt-BR', 'pt', 'en']`. Lookup walks
the chain **per key**, so a partially translated locale falls back message
by message. `selectSupportedLocale(navigator.languages, supported)` picks
the best available tag and otherwise returns the default.

An unresolved key returns the key itself — visible and greppable in a
screenshot, never a blank — and invokes `onMissingKey`, which the host can
wire to a development counter or a telemetry event. It never throws in
front of a player.

## Formatting

- **Placeholders**: `{name}`, substituted from a parameters object. A
  placeholder with no parameter is left visible and reported, not silently
  emptied.
- **Plurals**: `Intl.PluralRules` on the locale that actually *resolved*
  the message. Never `count === 1` — Polish alone needs `one`/`few`/`many`.
  A plain string entry is treated as its own `other` form, so adding
  plurals later is a catalog change, not a call-site change.
- **Numbers/dates**: `Intl.NumberFormat` / `Intl.DateTimeFormat`.
  `formatDate` requires an explicit time zone and defaults to `UTC` rather
  than inheriting the host's, so output is reproducible in tests and on a
  server.
- A full ICU MessageFormat parser is deliberately not adopted and
  deliberately not hand-written. Where a message needs nested selection,
  split it into separate keys chosen in code.

## Pseudo-locale (`en-XA`)

`buildPseudoLocaleCatalog()` derives the pseudo-locale mechanically from
the default catalog, so it cannot drift. It accents letters, pads by ~35 %
and brackets the result with `⟦ ⟧`, while copying `{placeholder}` spans
through byte-for-byte and wrapping each one in `⟨ ⟩`.

Running the UI in `en-XA` surfaces three bug classes before a translator is
paid:

- a string that stays unaccented is hard-coded outside the catalog;
- a clipped string loses its `⟧`, exposing a layout that cannot take longer
  text;
- a mangled `{placeholder}` shows broken interpolation.

**The `⟨ ⟩` markers were added by #664 and this paragraph used to say the
placeholder span was copied "through untouched"**, which was true of the span
and misleading about the screen: the *value* substituted into it is ordinary
English, so it is unaccented text inside a bracketed message and
indistinguishable from a hard-coded fragment. The 2026-08-30 sweep
(`docs/research/2026-08-30-what-stays-readable-under-the-pseudo-locale.md`)
lost its sharpest finding to exactly that ambiguity. With the markers the
three classes separate:

| ASCII text sits… | it is |
| --- | --- |
| inside `⟨ ⟩` | a parameter the call site passed in |
| inside `⟦ ⟧`, outside `⟨ ⟩` | a fragment concatenated into the message after lookup |
| outside `⟦ ⟧` | a string that never reached the catalog, or a key that resolved to nothing |

`tests/helpers/pseudo-locale-residue.ts` is the classifier that applies that
table, and `tests/foundation/pseudo-locale-contract.test.ts` runs it over
every message in the default catalog.

## Authoring checklist

1. Add the message key to `defaultMessageCatalogEn` (services/UI strings)
   or to `src/content/default-locale-en.ts` (content labels).
2. Reference it by key. Never inline a player-visible literal.
3. If the string counts something, author plural forms rather than
   concatenating a number and a noun.
4. Keep punctuation and units inside the message; do not assemble sentences
   from fragments in code — word order differs per language.
5. Run the pseudo-locale over the screen you changed.

A test asserts that every content definition's `nameKey` resolves in the
default catalog, so an unlocalized catalog entry fails CI rather than
shipping.

## The 2026-09-13 identity delivery's voice and localization requirements

`docs/design/2026-09-13-identity-v5/` (vendored verbatim, never edited) sets a
product voice and repeats a localization requirement `docs/VISUAL_IDENTITY.md`
and `docs/IDENTITY_V5_ROLLOUT.md` stage 6 already record. This section checks
that requirement against what this repository already does, rather than
restating it from memory.

### Voice: fact → place → next step

`DOKUMENTACJA/projekt.md` §"Głos produktu" states the pattern as **fakt →
miejsce → następny krok** ("fact → place → next step", `projekt.md:101`) and
names four direct verbs: *Wybierz, Sprawdź, Zaplanuj, Zapisz* (Choose, Check,
Plan, Save, `projekt.md:103`). It carries a ten-row table of example messages
(`projekt.md:105-116`).

**Those rows are shapes, not strings to paste.** The delivery says so of
itself, verbatim: *"Liczby są przykładowe. Komunikaty i akcje wymagają dowodu w
kodzie przed integracją."* ("Numbers are illustrative. Messages and actions
need proof in code before integration," `projekt.md:118`.) The 350, the six
wall segments, the 14:32 save time, the three people waiting on a bed — every
number in that table is invented for the mock. Shipping one unchanged would be
exactly the promise `AGENTS.md`'s fourth reservation exists to stop: a
sentence with a number nothing in `src/` produced.

**`AGENTS.md`'s fourth reservation governs every string this voice motivates.**
The choice of words has been ours since the owner's release of 2026-09-04;
whether the sentence is *true* has not. So for such a string:

1. Open the code that makes it true, and cite it.
2. Quote the string verbatim in the commit message **and** in the pull
   request body, beside that citation.
3. If the code does not make it true, the string does not ship.

**`docs/PLAYER_STRINGS.md` cannot carry this argument, and that is worth being
explicit about.** It is the record that release promises the owner, but its
entire content — including its own header — is
`tooling/player-string-inventory.mjs`'s `renderInventory()` output, and
`tests/foundation/player-string-inventory-contract.test.ts` requires the
committed file to equal that output byte-for-byte; there is no room in it for
hand-written prose about a voice, and adding any would fail that gate the next
time the generator runs. The three-step rule above is recorded here instead,
and applies regardless of which of this repository's documents a reader opened
first.

### The three sentences article 5 names as never to write

`konstytucja.md` article 5, "Każde zdanie jest prawdziwe" ("every sentence is
true"), gives three worked examples, and `docs/IDENTITY_V5_ROLLOUT.md` stage 6
already quotes them. Each already has a shipped answer in this tree, cited
here rather than restated from memory:

- *"Nie mów „zapisano", zanim zapis zostanie potwierdzony."* — do not say
  "saved" before a write is confirmed. `save.status.saved`
  (`src/content/default-locale-en.ts:3137`, "Saved (generation
  {generation})") already ships only after a confirmed write; see
  `docs/PERSISTENCE.md` for the save/load contract this rests on.
- *"Nie mów „wolne miejsce", jeśli znana jest wyłącznie liczba łóżek."* — do
  not say "free space" from a bed count alone. `hud.status.prisoners-without-bed`
  (`src/content/default-locale-en.ts:167`) already counts people with no bed,
  not beds — its own comment says the alternative "counts what is missing
  rather than what is fine".
- *"„Brak incydentów" i „brak danych" to różne stany."* — "no incidents" and
  "no data" are different states. `hud.alert.event.incidents.all-clear`
  (`src/content/default-locale-en.ts:1618`) and
  `hud.alert.event.incidents.all-clear-after-lapse` (`:1669`) already
  distinguish a handled incident from one that expired unhandled and hurt
  everyone in it — the distinction issue #914 forced.

None of the three is a gap in this repository today; a new string that
reintroduces one of these three shapes, not the absence of the shapes
themselves, is the failure mode to watch for.

### The mechanical requirements, checked against what exists

`projekt.md:120` states four requirements together: *"Lokalizacja: stabilne
klucze, pełne zdania, bez konkatenacji; odmiana 1 osoba / 2 osoby / 5 osób;
liczby i daty zgodne z locale."* ("Localization: stable keys, whole sentences,
no concatenation; the 1 osoba / 2 osoby / 5 osób inflection; locale-correct
numbers and dates.") `docs/IDENTITY_V5_ROLLOUT.md` stage 6 repeats the same
four and names the gates; this is what each one is against the tree, checked
rather than assumed:

- **Stable keys.** Already the architecture — "Three namespaces that never
  merge" above — gated by
  `tests/foundation/localization-key-completeness.test.ts`. Not new.
- **Whole sentences, no concatenation.** Already the authoring checklist's
  rule 4 below, and gated the same way, with two known exceptions this file
  already tracks under "Not done here" (two accessible names still assembled
  in code). Mostly in force, not fully clean.
- **Polish plural forms (1 osoba / 2 osoby / 5 osób).** The *mechanism* is
  already here — `Intl.PluralRules` on the resolved locale, under
  "Formatting" above — but the *content* is not. No `pl` catalog exists
  anywhere in this tree; `defaultMessageCatalogEn` carries exactly **two**
  plural-form entries and both are English-only demonstration values
  (`src/services/localization/default-catalog.ts:25`, `:29`); and
  `tests/foundation/second-locale-contract.test.ts` pins the 24 flat
  `{count}` messages (see "Not done here" below) that would each need real
  plural forms — including a
  Polish `few`/`many` split — before a Polish catalog could resolve them
  correctly. This is genuinely outstanding work, not a restatement of
  something already built.
- **Locale-formatted numbers and dates.** Already `Intl.NumberFormat` /
  `Intl.DateTimeFormat`, under "Formatting" above. Not new.

## Not done here

Issue #36 explicitly excludes translating the game before content
stabilizes. This is the infrastructure plus the default locale; no second
locale is authored, and no translation vendor process is defined yet.

Two things the infrastructure owes a translator, recorded rather than fixed
because both mean authoring player-visible copy:

- **24 messages interpolate `{count}` into a flat string** (22 when this
  section was last corrected, 21 when first counted; `hud.alert.occurrences`
  arrived with #754 and is a `×` formula like the other two, not a sentence).
  **Re-measured while writing the 2026-09-13 identity-delivery section
  above**: `FLAT_MESSAGES_WITH_COUNT` in
  `tests/foundation/second-locale-contract.test.ts` currently pins 24 keys,
  not 22 — this paragraph is the sentence `docs/AGENT_WORKFLOW.md` §4 warns
  about, a tally that rots on the next addition and not on the next edit
  here. English reads correctly; Polish needs `few` and `many` for 2, 3, 4,
  22 … and a translator cannot add a form to a key that has none. Pinned in
  that same file so the list cannot grow unnoticed. Only 2 of 644 messages
  are plural entries today (`defaultMessageCatalogEn.messages` — this said
  591; re-measured the same pass).
- **2 accessible names are assembled in code** from a localized word, a
  hard-coded `": "` and another element's text. Rule 4 above forbids it;
  the same gate pins both sites.
