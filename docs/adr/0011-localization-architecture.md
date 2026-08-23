# ADR 0011: Localization Architecture and Stable-ID Separation

## Status
Accepted

## Context
Issue #36 requires localization to be designed *before* content and UI
strings become identifiers, because the failure mode is not "we have to
translate later" — it is "the English string is already a lookup key, a
save-file value or a branch condition, and now every locale changes
behavior".

The repository already made the first correct move: content definitions
carry a `nameKey` (`room.cell.name`) rather than a label, resolved through
`src/content/localization.ts`. That module says outright that it is a
placeholder for "a future UI/localization issue" and resolves against a
single in-memory `en` map with no fallback, plurals or formatting. This ADR
replaces that placeholder with real infrastructure without changing the
key-based content contract that already exists.

## Decision

### Three separate namespaces, permanently
| Namespace | Example | Stability | May reach the player |
| --- | --- | --- | --- |
| **Stable content/simulation ID** | `room.cell`, `item.brick` | Persisted in saves, in the wire protocol and in numeric-id catalogs. Changing one is a migration. | never |
| **Message key** | `room.cell.name` | Stable, ASCII, may be renamed with a catalog change only. | never |
| **Translated text** | "Cell", "Cela" | Free to change per locale and per release. | always |

Simulation code may branch on a stable ID. It may not read a message key's
*text*, and no translated string may be persisted, hashed, checksummed or
compared. Restated as a boundary rule in `docs/ARCHITECTURE.md` and
enforced by a test that keeps `src/simulation/` free of localization
imports.

### ICU-lite formatting on `Intl`, not an ICU dependency
Messages support named placeholders (`{count}`, `{name}`) and per-key
plural forms selected via `Intl.PluralRules`. Numbers and dates are
formatted with `Intl.NumberFormat`/`Intl.DateTimeFormat`.

A full ICU MessageFormat parser (nested select/plural/ordinal, embedded
markup) is deliberately not adopted: `AGENTS.md` forbids adding a
dependency for functionality this small, and hand-writing an ICU parser
would be worse than either option. Where a message genuinely needs nested
selection, it is split into separate keys chosen in code. If real content
later proves that insufficient, adopting a library is an ADR amendment, not
an emergency.

`formatDate` requires an explicit time zone (default `UTC`) rather than
inheriting the host's, so output is reproducible in tests and on servers
(`docs/TESTING.md` forbids depending on the developer's locale/timezone).

### Fallback is a chain, and a miss is loud
`buildLocaleFallbackChain('pt-BR')` → `['pt-BR', 'pt', 'en']`: exact tag,
then base language, then the default locale, deduplicated. Lookup walks the
chain per key, so a partially translated locale falls back per message
rather than per catalog.

An unresolved key returns the key itself (visible and greppable, never
blank or an empty box) and invokes an optional `onMissingKey` hook so
missing keys can be counted in development or reported as a telemetry
event — never a thrown exception in front of a player.

### Catalogs are versioned data, loaded on demand
A catalog is `{ locale, version, messages }`, validated on load and
addressed by a versioned URL (`docs/DEPLOYMENT.md` already forbids mutable
stable-name files under `/assets/`). The default locale is bundled so the
game always has a complete set of strings offline; other locales load
asynchronously and merge over it. A catalog fails validation → the game
keeps the previous/default locale, it does not start with missing text.

### Pseudo-locale as a first-class test tool
`en-XA` is generated mechanically from the default catalog: accented
characters, ~35 % expansion and bracketing, with placeholders preserved
byte-for-byte. It exposes hard-coded strings (they stay unaccented),
truncation-prone layouts and broken interpolation *before* a translator is
paid, and it is asserted in tests rather than being a manual step.

## Alternatives considered
- **English strings as keys** (`t("Cell")`). Rejected: it makes the source
  text an identifier, so fixing a typo silently breaks every locale, and it
  collides on homonyms that translate differently.
- **A full i18n framework** (i18next/FormatJS). Rejected for now on
  dependency-policy grounds; the required surface here is a fallback chain,
  interpolation, plurals and `Intl` wrappers.
- **Translating everything now.** Explicitly out of scope in issue #36:
  content is not stable, and re-translating churn is wasted money. The
  infrastructure ships; only the default locale is authored.

## Consequences
- Every player-visible string added from now on needs a message key and a
  default-locale entry; a test asserts that every content `nameKey`
  resolves, so an unlocalized catalog entry fails CI rather than shipping.
- `src/content/localization.ts` remains the stable-ID-side primitive
  (`LocalizationKey`, the flat default map) and stays dependency-free;
  `src/services/localization/` is the runtime that consumes it.
- Locale-dependent formatting must never appear inside simulation or
  persistence code paths.
