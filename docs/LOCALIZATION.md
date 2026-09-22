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

> **Half of that last sentence is false since #662 (2026-09-14) and the
> paragraph is kept as it stood** (`docs/AGENT_WORKFLOW.md` §4). `src/main.ts`
> **does** register a locale: `CATALOG_CHUNKS` holds one thunk, `pl: () =>
> import('./services/localization/pl-catalog')`. The half that still holds is
> the re-render, which is still #663's — and the reason both halves were in one
> sentence is that they looked like one job and are not.

> **And the other half is settled since #663 (2026-09-14), by being decided
> rather than built.** There is no re-render. A language change takes effect on
> **reload**: the control persists the preference, awaits a save of the running
> prison, and reloads, so the boot path #662 built is the only path that ever
> applies a language. The decision, the measurement behind it (19 modules under
> `src/ui/` hold the one `Localizer`, across 331 formatting call sites, and none
> of them exposes a way to be handed a different one) and the two rejected
> alternatives are in
> [the ADR draft](./adr/drafts/how-a-language-change-reaches-a-running-page.md).
>
> So the sentence above is now wrong in a third way, and this is the useful
> one: *"that, and the re-render, are the language picker's work"* assumed the
> re-render was work. It was a question.

### Which locale a page starts in, and who decides

`resolveStartupLocale(bundled, loader, navigator.languages)` — composed in
`src/main.ts` from `selectSupportedLocale` and `switchLocale`, and awaited at
the top level, **before** the page's one `Localizer` is constructed. That
ordering is `Localizer`'s own stated contract (*"catalogs are loaded before a
`Localizer` is constructed, so rendering never awaits a translation"*), and it
is what keeps a re-render path out of this: the HUD, the save panel and the
world scene are handed one instance that is already in the right language.

Three properties of it are load-bearing and each is gated:

- **A player no published locale matches downloads nothing.** The thunk is not
  called at all, which is the whole point of the split. Measured on the
  production build of 2026-09-14: the Polish catalogue is 42,746 raw / 12,442
  gzipped bytes in a chunk `dist/client/index.html` neither names nor preloads,
  and the initial download moves 481,322 → 483,313 gzipped bytes for everyone.
- **A load that fails leaves the player in complete English, with a report.**
  `switchLocale` returns the caller's own localizer, and `src/main.ts` warns
  with the reason. `tests/browser/locale-delivery.spec.ts` blocks the chunk at
  the network and asserts the page comes up whole and raises nothing.
- **A bundled localizer that is already non-default is handed back untouched**
  rather than re-tagged `en`. One caller depends on it today:
  `tests/browser/pseudo-locale-sweep.spec.ts` patches the bundled localizer to
  `en-XA`, and the sweep would have been silently undone otherwise.

**The registry is in the composition root and not in
`src/services/localization/`**, because that layer performs no I/O and a
dynamic `import()` is a network fetch in a browser —
`tests/unit/services-layer-boundaries.test.ts` has counted it as one since
#664. The port takes an injected thunk; the entry point writes the import.

**What publishes and what is audited are pinned to each other.**
`tests/foundation/second-locale-contract.test.ts` reads `CATALOG_CHUNKS` out of
`src/main.ts` and requires it to equal the set of non-default catalogues it
audits, minus the pseudo-locale — so a locale a player can load and nobody
audits fails, and so does a catalogue audited and never registered.

### How a player chooses, and what "has not chosen" means

The picker is one cycling button in the HUD's **settings drawer**
(`src/ui/language.ts`, mounted through `HudHandle.preferencesSlot`) — the menu
that already holds the clock and the three region controls, and which was
renamed from *Layout* to *Settings* with it. It is not in the rail beside the
interface scale and the theme, and that is measured rather than chosen: 264px
holds two of those controls and not three, and a second line costs 54px the
aside does not have at 900×600 or 375×812. `src/main.ts` and `src/styles.css`
carry the numbers and the two failures they came from.

Its preference is `'auto' | 'en' | 'pl'`, stored under its own key
`lockstate.settings.language` (`src/input/language-preference.ts`,
`src/input/storage.ts`).

**`'auto'` is a value, not an absence**, and that is the whole of what the
storage shape buys. A stored locale tag alone cannot distinguish *"the player
chose English"* from *"the player has not chosen and their browser asked for
English"*, and the two must behave differently the moment the browser's list
changes. So the composition root turns a preference into the input
`selectSupportedLocale` already takes:

```ts
languagePreferenceRequest('auto', navigator.languages) // -> navigator.languages
languagePreferenceRequest('en',   navigator.languages) // -> ['en']
```

There is no second negotiator. A chosen locale is a preference list of one,
which is what makes the choice immune to the browser changing its mind.

Three properties are gated rather than asserted in prose:

- **The offered set equals the published set.** `OFFERED_LOCALES` beside the
  preference, `CATALOG_CHUNKS` in the composition root, and this file's audit
  registry are pinned to each other by
  `tests/foundation/second-locale-contract.test.ts` — so a picker entry that
  would silently fall back to English, and a catalogue a player can be
  negotiated into but never choose to leave, both fail.
- **Every language is named in itself.** `display.language.english` is
  `English` and `display.language.polish` is `Polski` in *every* catalogue,
  byte for byte, and the same test compares them. A picker that named languages
  in the current interface language would be unusable to exactly the player
  looking for one.
- **The endonyms still go through the catalogue.**
  `tests/browser/pseudo-locale-sweep.spec.ts` fails on any run of ASCII letters
  that did not come out of `Localizer.format`, so a string literal `'English'`
  in `src/ui/language.ts` would need an exemption added to that test to ship.

`PSEUDO_LOCALE` is never offered: it is not in `OFFERED_LOCALES`, and
`tests/browser/ui-language-picker.spec.ts` presses the whole cycle and asserts
it never appears.

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

**Where this catalogue already stands against the pattern, measured rather
than assumed** (`docs/research/2026-09-14-stage-6-language-gap.md`): the
English strings already do the first two beats. Every sampled refusal reads
`<outcome> — <reason>` and every sampled event reads `<what happened> —
<consequence>` — fact, then place/consequence. **What nothing in the codebase
wires is the third beat: a next-step action attached to a message.** No code
under `src/ui/` attaches a "jump to this tile/room" or "open this panel"
handler to an alert or refusal row; the row renderer takes a label and an icon,
never a destination. A voice guide that asks authors for a next-step verb no
mechanism can carry out is a guide that will be ignored, or — worse — obeyed by
wiring an action-verb button to nothing on press, which is precisely the
anti-pattern constitution article 6 names: *"Przycisk naprawczy musi mieć
rzeczywistą implementację; inaczej tekst tylko wyjaśnia stan"* ("A repair
button must have a real implementation; otherwise the text only explains the
state," `konstytucja.md`). **So: author fact → place now. Do not author a
next-step action verb on any control until the navigation mechanism it presses
exists** — that mechanism is its own, larger piece of stage 6's cost, not a
wording exercise.

### The three sentences article 5 names as never to write

`konstytucja.md` article 5, "Każde zdanie jest prawdziwe" ("every sentence is
true"), gives three worked examples, and `docs/IDENTITY_V5_ROLLOUT.md` stage 6
already quotes them. Each already has a shipped answer in this tree, cited
here rather than restated from memory:

- *"Nie mów „zapisano", zanim zapis zostanie potwierdzony."* — do not say
  "saved" before a write is confirmed. `save.status.saved`
  (`src/content/default-locale-en.ts:3400`, "Saved (generation
  {generation})") already ships only after a confirmed write; see
  `docs/PERSISTENCE.md` for the save/load contract this rests on.
- *"Nie mów „wolne miejsce", jeśli znana jest wyłącznie liczba łóżek."* — do
  not say "free space" from a bed count alone. `hud.status.prisoners-without-bed`
  (`src/content/default-locale-en.ts:203`) already counts people with no bed,
  not beds — its own comment says the alternative "counts what is missing
  rather than what is fine".
- *"„Brak incydentów" i „brak danych" to różne stany."* — "no incidents" and
  "no data" are different states. `hud.alert.event.incidents.all-clear`
  (`src/content/default-locale-en.ts:1840`) and
  `hud.alert.event.incidents.all-clear-after-lapse` (`:1891`) already
  distinguish a handled incident from one that expired unhandled and hurt
  everyone in it — the distinction issue #914 forced.

**The third of the three was not clean when this section was written, and the
paragraph that said so is kept below rather than deleted, because the shape it
describes is the one to watch for.** `'hud.alerts.empty'` ("No active alerts")
rendered from the same `alerts: []` literal that `EMPTY_HUD_VIEW_MODEL` carried
**before the first worker snapshot arrived** — the render path tested only
`viewModel.alerts.length === 0` and had no branch for "no snapshot yet" — while
the sibling `clock` field in that same empty view model had been deliberately
given a sentinel for exactly this state (`clock: UNKNOWN_HUD_CLOCK`). Filed as
[#1184](https://github.com/woogitsu/lockstate/issues/1184).

**#1184 is closed.** `HudViewModel.alerts` is now optional and absence is the
state: `src/main.ts` sets it only from a message that carries alerts and deletes
it on `simulation/stopped`, `hudAlertsFromWorkerMessage`
(`src/ui/simulation-alerts.ts`) answers `'none'` for that message, and the HUD
paints `'hud.alerts.unknown'` — *"No prison is reporting."* — for absence while
`'hud.alerts.empty'` keeps the state it was always true of, a prison that is
reporting and has nothing wrong to report. Both sentences are asserted against
each other in `tests/browser/ui-shell.spec.ts`.

**The shape outlived the key, which is the part worth carrying forward.** A
survey done while closing #1184 found it once more, in the status strip:
`EMPTY_HUD_VIEW_MODEL.counts` is a confident row of zeros in the same two
states, so a page that has heard from nobody states *Prisoners 0, Funds 0* —
beside a clock that reads `--` in that same paint. Filed as
[#1191](https://github.com/woogitsu/lockstate/issues/1191). So all three named
anti-patterns are held in words today, one of them has an open instance in
figures, and a new string that reintroduces any of the three shapes — "no
incidents" included — is the failure mode to watch for, because this one
already did.

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
  `tests/foundation/second-locale-contract.test.ts` pins the flat
  `{count}` messages by name in `FLAT_MESSAGES_WITH_COUNT` (see "Not done here"
  below) — **the count is deliberately not repeated here; it said 24 while the
  correction three paragraphs down already said 27** — that would each need
  real plural forms — including a
  Polish `few`/`many` split — before a Polish catalog could resolve them
  correctly. This is genuinely outstanding work, not a restatement of
  something already built.

  > **Two of those sentences are now false and one has grown, and the row is
  > kept as it stood** (`docs/AGENT_WORKFLOW.md` §4). **A `pl` catalogue does
  > exist** — `src/content/locale-pl.ts` and
  > `src/services/localization/pl-catalog.ts`, 669 of 669 keys, #661,
  > 2026-09-14 — and the flat `{count}` list pins **27**, not 24; that tally is
  > exactly the sentence §4 warns rots on the next addition rather than on the
  > next edit here, and it has rotted twice in this paragraph already (21 → 22
  > → 24 → 27).
  >
  > **What is still true is the half that matters, and it is more interesting
  > than the half that broke.** The Polish catalogue authors **no** plural
  > forms for those 27 keys and did not need to, because a `pl` catalogue
  > *cannot* fix them from its side and would not be rendered if it could:
  > `buildLocalizationCatalog` takes `Record<LocalizationKey, string>` so a
  > content catalogue holds no plural entry in any locale, `Localizer.format`
  > reads `entry.value.other` for a plural entry, and `HudLocalizer` exposes
  > `format` and not `formatPlural`. Every counted message in `pl` is written
  > to be correct at every count instead — which is why *1 osoba / 2 osoby /
  > 5 osób* is satisfied by reshaping rather than by forms, and why this row's
  > conclusion ("genuinely outstanding work") was right about the work and
  > wrong about what the work would turn out to be.
  >
  > > **TWO OF ITS THREE REASONS ARE NO LONGER TRUE, AND THE PARAGRAPH IS KEPT
  > > AS IT STOOD** (`docs/AGENT_WORKFLOW.md` §4). Corrected 2026-09-21. The
  > > sentence *"`buildLocalizationCatalog` takes `Record<LocalizationKey,
  > > string>` so a content catalogue holds no plural entry in any locale"* was
  > > the first of the two mechanical blockers, and *"`HudLocalizer` exposes
  > > `format` and not `formatPlural`"* was the second. Both were removed
  > > together: `src/content/localization.ts` now declares
  > > `LocalizationPluralForms` and `buildLocalizationCatalog` takes
  > > `Record<LocalizationKey, LocalizationEntry>`, and `HudLocalizer` in
  > > `src/ui/hud/view-model.ts` carries `formatPlural` beside `format`.
  > > `tests/foundation/polish-plural-forms-contract.test.ts` gates both, and
  > > the middle reason (*"`Localizer.format` reads `entry.value.other`"*) is
  > > unchanged and still true — it is why a call site that wants a form has to
  > > ask for one.
  > >
  > > **Nothing was migrated with them, and the count is 33 rather than 27.**
  > > Every entry in both shipped content catalogues is still a plain string,
  > > so the paragraph's last clause — *1 osoba / 2 osoby / 5 osób* satisfied
  > > by reshaping — still describes what is on screen today, and every one of
  > > the 33 was re-read against `Intl.PluralRules('pl')` on 2026-09-21 and is
  > > correct at every count. What changed is only that a key *may* now be
  > > given forms. The tally is not restated here for the reason this paragraph
  > > already gives; `FLAT_MESSAGES_WITH_COUNT` in
  > > `tests/foundation/second-locale-contract.test.ts` is the list, and its
  > > `toEqual` is the only place the set is stated.
- **Locale-formatted numbers and dates.** Already `Intl.NumberFormat` /
  `Intl.DateTimeFormat`, under "Formatting" above. Not new.

## Not done here

Issue #36 explicitly excludes translating the game before content
stabilizes. This is the infrastructure plus the default locale; no second
locale is authored, and no translation vendor process is defined yet.

> **The middle clause is false twice over and the sentence is kept**
> (`docs/AGENT_WORKFLOW.md` §4). A second locale **is** authored — `pl`, 669 of
> 669 keys, #661, 2026-09-14 — and since #662 a player whose browser asks for
> it gets it. What survives is the last clause: no translation vendor process
> exists, and none was needed, because `AGENTS.md`'s fourth reservation was
> partly released on 2026-09-04 and the wording of a player-visible string has
> been ours since. Its *truth* has not been, which is why every Polish sentence
> translates an English one already gated by
> `tests/foundation/localization-key-completeness.test.ts` rather than making a
> new claim.

Two things the infrastructure owes a translator, recorded rather than fixed
because both mean authoring player-visible copy:

- **Some messages interpolate `{count}` into a flat string**, and the number
  is no longer written here. It has rotted four times — 21 → 22 → 24 → 27 —
  and on 2026-09-15 this file said **24** in three places and **27** in a
  fourth, all four in the same document, with the assertion pinning 27.
  `FLAT_MESSAGES_WITH_COUNT` in
  `tests/foundation/second-locale-contract.test.ts` is the list, by key, and
  its `toEqual` is the only place the set is stated; a key added without an
  entry fails there. English reads correctly; Polish needs `few` and `many`
  for 2, 3, 4, 22 … and a translator cannot add a form to a key that has
  none. **Exactly two keys in the English catalogue are plural entries**
  (`save-slots.available` and `save-slots.over-capacity`), which the same file
  asserts as a floor beside a floor on the catalogue's total size, so the
  denominator is stated there and not here — it has been written as 591 and
  as 644 in this bullet alone.
- **2 accessible names are assembled in code** from a localized word, a
  hard-coded `": "` and another element's text. Rule 4 above forbids it;
  the same gate pins both sites.

> **THE FIRST BULLET'S LAST SENTENCE IS NOW FALSE AND THE BULLET IS KEPT AS IT
> STOOD** (`docs/AGENT_WORKFLOW.md` §4). *"Exactly two keys in the English
> catalogue are plural entries (`save-slots.available` and
> `save-slots.over-capacity`)"* was true until 2026-09-21. It is **four**: the
> alerts path learned to select a form
> (`src/ui/hud/label-parameters.ts`'s `renderHudLabel`, recorded in
> [an unnumbered ADR draft](./adr/drafts/what-selects-a-plural-form-on-the-alerts-path.md)),
> and the two counted alert sentences whose **English** disagreed with their
> own number migrated behind it — `hud.alert.event.incidents.riot-opened`, which
> rendered *"1 prisoners have stopped taking orders"*, and
> `hud.alert.event.prisoners.discharged`, which rendered *"their sentences are
> served"* for one prisoner.
>
> **The rest of the bullet survives, and the interesting part is which rest.**
> The tally it refuses to repeat has not rotted a fifth time, because it is
> still not written here. The flat list is now **31** rather than 33, and the
> number is still stated in exactly one place —
> `FLAT_MESSAGES_WITH_COUNT` in `tests/foundation/second-locale-contract.test.ts` —
> which is the discipline the bullet argues for rather than an exception to it.
>
> **Nothing else migrated, and that is a decision.** Every one of the remaining
> 31 was read: each is either a formula whose counting is carried by `×`, a
> colon or a preposition, or a Polish sentence deliberately reshaped so that no
> noun agrees with the figure. Giving those forms would produce identical
> strings in every category, which
> `tests/foundation/polish-plural-forms-contract.test.ts` refuses by name —
> *"four identical forms is a flat string with extra steps"*.
