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

## Not done here

Issue #36 explicitly excludes translating the game before content
stabilizes. This is the infrastructure plus the default locale; no second
locale is authored, and no translation vendor process is defined yet.
