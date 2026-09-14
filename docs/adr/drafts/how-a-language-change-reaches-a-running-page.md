# ADR draft: how a language change reaches a running page

> **This draft deliberately carries no number.** ADR numbers are assigned
> centrally after drafts return (`AGENTS.md`), and this one pre-commits to
> being renumbered without argument, along with every citation of it added by
> the same branch — `src/ui/language.ts`, `src/main.ts`,
> `src/input/storage.ts`, `docs/LOCALIZATION.md` and `docs/INPUT.md`, each of
> which names this file by path rather than by number for exactly that reason.

## Status

**Proposed.** The decision it records is implemented on the branch that carries
it, because the issue it answers (#663) cannot be implemented without taking
it: a language picker is a control whose only behaviour *is* the answer to this
question. The order — implementation ahead of the record — is the one
[ADR 0065](../0065-what-happens-to-a-save-this-build-cannot-read.md) took, in
its own words: *"the defect is live rather than hypothetical, and this document
is what the branch should be judged against."*

## Context

[ADR 0011](../0011-localization-architecture.md) decided how a locale is
resolved, how a catalogue is delivered and how a missing key falls back. It is
silent on one question, and #663 is the issue that makes the silence expensive:

> **When a player changes language on a page that is already running, what
> happens to the interface that is already on screen?**

#662 answered the *boot* half on 2026-09-14. `resolveStartupLocale` composes
`selectSupportedLocale` with `switchLocale` in the composition root and is
awaited **before** the page's one `Localizer` is constructed, so the HUD, the
save panel and the world scene are handed an instance that is already in the
right language. Its own docblock names what it deliberately left:

> Switching *after* boot is a different problem — it needs a re-render path for
> panels already holding an instance — and it is #663's, not this.

`docs/LOCALIZATION.md` says the same thing twice, once as a correction to
itself: *"The half that still holds is the re-render, which is still #663's —
and the reason both halves were in one sentence is that they looked like one
job and are not."*

### What the constraint actually is

`Localizer`'s class docblock states it as a contract rather than as an
implementation detail (`src/services/localization/localizer.ts:34`):

> Pure and synchronous: catalogs are loaded before a `Localizer` is
> constructed, so rendering never awaits a translation.

An instance is immutable in the ways that matter here. Its `locale`, its
fallback chain and its catalogue map are all fixed in the constructor
(`:41`–`:52`), and `formatNumber` / `formatDate` read `this.locale`
(`:95`, `:99`) — so `Intl` grouping and date formatting are properties of the
*instance*, not of a call. Changing language therefore means **a different
`Localizer` object**, which `withLocale` (`:105`) already builds. It does not
mean mutating one.

### How far that instance has spread, counted

Measured on this branch, `origin/main` at `4a0b6fd4` plus this issue's control:

- **19 modules under `src/ui/` take a localizer** and hold it in a field or a
  closure — `brand-badge.ts`, `display-scale.ts`, `save-panel.ts`,
  `telemetry-consent-prompt.ts`, `theme.ts`, `language.ts`,
  `simulation-events.ts`, and twelve under `src/ui/hud/` (`build-panel.ts`,
  `hud.ts`, `intake-panel.ts`, `layout-shell.ts`, `messages.ts`,
  `overview-panel.ts`, `projection.ts`, `regime-panel.ts`, `rooms-panel.ts`,
  `staff-panel.ts`, `status-strip.ts`, `view-model.ts`).
- **331 formatting call sites** across them (`t(…)`,
  `localizer.format*`).
- **Zero of them expose any way to be handed a different one.**
  `grep -rnE "setLocalizer|withLocale|retranslate|relocalize" src/ui src/rendering`
  returns nothing at all.

The shape matters as much as the count. `mountHud` destructures the localizer
once (`src/ui/hud/hud.ts:1098`) and defines `t` over it, and the panels it
builds format their **static** furniture at construction: tab labels, section
headings, button captions, legends, `aria-label`s, `title`s. Those strings are
written into the DOM once and never recomputed, because nothing about them
changes while the game runs. A readout that repaints every tick would follow a
new localizer; a tab label would not.

### Two things that are worse than they look, and one that is better

1. **A partial switch is not a partial success.** #663 names it: *"An in-place
   change must not leave half the interface in the old language, which would be
   worse than either."* On this tree the split would not even be random. The
   **map** would follow and the **panels** would not:
   `WorldSceneOptions.roomName` is a function closing over the localizer
   (`src/main.ts:652`), and `RoomLabelLayer` re-reads it every refresh and
   re-texts a label whose name changed (`src/rendering/phaser/room-label-layer.ts:127`).
   So a player who switched to Polish in place would watch the prison's room
   names turn Polish under an English HUD.
2. **`Intl` follows the instance, so numbers are part of the same problem.**
   #663 lists it separately — *"Switching language and leaving numbers
   formatted `en` is a half-switch"* — and it is the half a unit test does not
   see. Every money and count readout goes through `localizer.formatNumber`, so
   the grouping separator changes only where the new instance reached.
3. **Nothing is lost by reloading that the code cannot save first.** The
   simulation lives in a worker and its authoritative state is written to
   IndexedDB by `SessionController`. A reload fires `pagehide`, which
   `LifecycleSaveHandler` answers with a save it explicitly does **not** await
   — *"a lifecycle handler cannot hold the page open for an async IndexedDB
   transaction, so the write may simply not complete"*
   (`src/persistence/session/lifecycle.ts:64`) — so a reload alone risks the
   interval since the last of the 30-second dirty-driven autosaves. But that is
   a property of *unannounced* navigation. A language change is code we wrote
   deciding to navigate, and it can `await controller.saveNow()` first, which
   reports failure as a value and never throws.

## Decision

**A language change takes effect on reload.** The control persists the
preference under its own key, awaits a save of the running prison, and reloads
the page. The boot path #662 built is the only path that applies a language,
and there is exactly one.

Three consequences are part of the decision rather than side effects of it:

1. **The preference is persisted before anything else happens, and a refused
   write cancels the reload.** Every other preference in this tree treats a
   refused `localStorage` write as "not remembered" and switches anyway
   (`src/input/storage.ts`'s standing position). This one cannot: the reload
   *is* the switch, so a refused write would reload straight back into the
   language the player asked to leave — a control that appears to do nothing.
   `saveLanguageSettings` therefore returns whether the write landed, and
   `src/main.ts` declines to reload when it did not.
2. **The save is awaited.** Not the fire-and-forget lifecycle save: here there
   is somewhere to await, and the alternative is losing up to an autosave
   interval of play as the price of changing language.
3. **The tooltip says so.** `display.language.cycle` reads *"Change the
   interface language and reload the game"*. `AGENTS.md`'s fourth reservation
   makes the truth of a player-visible sentence the owner's; the sentence is
   true, and a control that reloaded a game without saying it would be hiding a
   consequence rather than choosing words.

## Alternatives considered

### A. Re-render in place, by teaching every surface to accept a new localizer

The honest version of this: 19 modules gain a `setLocalizer` (or a
`retranslate`), every one of the 331 call sites is audited for whether it runs
at construction or at render, and every panel grows a path that rebuilds its
static furniture without losing its scroll position, its selection, its
`disabled`-while-a-command-is-in-flight state or its focus.

It was rejected on three grounds, in this order:

- **It is a large, low-value change to code that has no other reason to become
  re-renderable.** Nothing else in this interface ever needs a panel's static
  labels rebuilt; the only caller would be this one.
- **Its failure mode is the defect the issue names.** A missed call site is
  invisible in review and invisible in a test that mounts one panel, and it
  ships as a page half in each language. The count above is the size of the
  surface that has to be exhaustively right.
- **It buys nothing a reload does not.** The state a reload costs is either
  persisted already (the prison, the layout, the theme, the interface scale) or
  is ephemeral chrome the player re-establishes in a second (which tab is open,
  which prisoner is selected, whether a build tool is armed).

**Its cost is not zero and is not claimed to be.** A reload is a visible
interruption: the page goes blank, the worker restarts, the world re-streams
and the camera returns to its default. Against a change a player makes once,
that is the cheaper side.

### B. Re-render in place, by tearing down and remounting the interface

Cheaper to describe and no cheaper to build. `mountHud` returns a handle with a
`destroy` (`src/ui/hud/hud.ts:1078`) and `SavePanel` has `dispose`, but the
*wiring* between them and the simulation client, the command sender, the build
and room tools, the telemetry prompt and the Phaser scene is several hundred
lines of `src/main.ts` with no teardown path at all. A remount would have to
re-subscribe all of it, and getting that wrong leaks a subscription per switch
rather than producing a visible defect — the worst shape of bug to ship.

Reloading is this alternative, performed by the browser, correctly, for free.

### C. Do not persist at all: negotiate from `navigator.languages` every time

This is the tree before #663 and it is not an answer to the issue. It is
recorded because it names the value `'auto'` preserves: the browser's list
stays the source for a player who has expressed no preference, and only for
them.

## What this does not decide

- **Whether a future surface may switch in place.** If a screen is ever built
  whose text all flows from a view model recomputed per frame, nothing here
  forbids it from following a new localizer. This decides what happens *today*,
  for an interface whose static furniture is written once.
- **Which locales are offered.** That is `CATALOG_CHUNKS` in the composition
  root and `OFFERED_LOCALES` beside the preference, pinned to each other by
  `tests/foundation/second-locale-contract.test.ts`.
- **Anything about the save format.** A language is a device preference. It has
  its own `localStorage` key, it is not in the save payload, and
  `SAVE_SCHEMA_VERSION` does not move for it — the same position ADR 0112
  decision 1 and constitution article 13 take for the theme and the layout.
