# ADR draft: what a second tab follows

> **This draft deliberately carries no number.** ADR numbers are assigned
> centrally after drafts return (`AGENTS.md`), and this one pre-commits to
> being renumbered without argument, along with every citation of it added by
> the same branch — `src/main.ts`, `src/input/storage.ts`,
> `tests/unit/input-cross-tab-settings.test.ts` and
> `tests/browser/ui-cross-tab-preferences.spec.ts`, each of which names this
> file by path rather than by number for exactly that reason.
> `grep -rn "what-a-second-tab-follows" src/ docs/ tests/` is the list, so a
> fifth citation added later cannot be missed by reading this sentence.

## Status

**Proposed.** The decision it records is implemented on the branch that carries
it, for the reason the language draft beside it gives for the same ordering:
the issue it answers (#1199) is a question about behaviour, and the behaviour
*is* the answer.

## Context

Four preferences live in `localStorage` under four keys, one each by
constitution article 13 (`src/input/storage.ts:49`, `:57`, `:70`, `:90`):

| Preference | Key | Applied by |
| --- | --- | --- |
| interface scale | `lockstate.settings.accessibility` | `applyAccessibilitySettings`, `src/ui/display-scale.ts:114` |
| theme | `lockstate.settings.theme` | `applyTheme`, `src/ui/theme.ts:96` |
| HUD layout | `lockstate.settings.layout` | `HudLayoutShell.setSettings`, `src/ui/hud/layout-shell.ts:710` |
| language | `lockstate.settings.language` | the boot path only — `resolveStartupLocale`, before the one `Localizer` is built |

Nothing in `src/` bound the `storage` event, so a second tab of the same origin
never heard any of the four change. #1199 reports it, and reports that the
owner's own delivery names the opposite behaviour — *"Zwykłe karty odbierają
zmiany preferencji przez storage event"*
(`docs/design/2026-09-13-identity-v5/DOKUMENTACJA/03-INTERAKCJE-I-URZADZENIA.md:34`).

The question the issue asks is not how to attach a listener. It is **whether a
tab should follow at all**, and it notes that the delivery's own rule for the
embed previews (`:38`, a per-iframe in-memory store) is that *some* contexts
must not.

### The four are not one problem, and the split is measurable

Three of them are applied by a function that takes a settings record and writes
to the DOM. Each already has a second caller — the local control — so
"apply a record that arrived from elsewhere" is a call, not a mechanism:

- `applyAccessibilitySettings(root, settings)` writes `--ui-scale` and one
  dataset flag, and `DisplayScaleControl.setScale` repaints the readout.
- `applyTheme(root, theme)` writes `data-theme`, which is the whole of applying
  a theme: no component stylesheet names a colour.
- `HudHandle.setLayout(settings)` is documented, before this issue existed, as
  the path for *"a preference restored after mount"*, and as one that
  deliberately does not report back through `onLayoutChange`
  (`src/ui/hud/hud.ts:1080`).

**The language has no such function and cannot be given one cheaply.**
`docs/adr/drafts/how-a-language-change-reaches-a-running-page.md` measured the
surface: 19 modules under `src/ui/` hold a `Localizer` across 331 formatting
call sites, and `grep -rnE "setLocalizer|withLocale|retranslate|relocalize"
src/ui src/rendering` returns nothing. `Localizer`'s own contract is that
catalogues are loaded before an instance is constructed
(`src/services/localization/localizer.ts:36`), so a language change means a
different object, and nothing in the interface can be handed one. That is why
the local control applies a language change by reloading the page.

## Decision

**The interface scale, the theme and the HUD layout follow across tabs. The
language does not.**

1. `src/main.ts` subscribes once, through
   `subscribeToSettingsChanges(globalThis.window, …)`, and answers each of the
   three keys with the same apply-path its own control uses, minus the write.
2. `lockstate.settings.language` is matched by nothing. A tab stays in the
   language it booted in until it is reloaded.
3. **Nothing on screen says otherwise.** No sentence is added to any control,
   and the language control's tooltip keeps saying exactly what it does —
   *"Change the interface language and reload the game"*, which is true of the
   tab it is pressed in and claims nothing about any other.

### Why nothing persists on the receiving side

`storage` does not fire in the document that performed the write, which is a
property of the event rather than of this code. So the receiving tab applying
what it was told cannot echo it back, and no loop guard, no sequence number and
no "last writer" bookkeeping is needed. `ThemeController.adopt` exists for this
and is `select` without `persist` for exactly that reason; `setLayout` was
already written not to call `onChange`.

### Why a clear is answered with defaults

`localStorage.clear()` reports one event with `key === null` rather than one
per key, so it is answered as all three reverting to their defaults — which is
what the store then holds. A tab that ignored it would keep painting a
preference that no longer exists.

## Alternatives considered

### A. Follow nothing — leave it as it is

The status quo, and it is defensible: a player with the game open twice and the
theme deliberately different in each is a real case, and #1199 says so. It was
rejected because it is the *rarer* case. Two tabs of one game are usually two
views of one session, a player changing the interface scale is changing it
because they cannot read the interface, and the second tab not following means
they change it twice. The delivery names following as the behaviour, and
nothing in this repository had ever decided against it — it had only never been
built.

**What it costs to reject it is stated rather than hidden:** a player who
*wants* two themes cannot have them, and this decision gives them no way to opt
out. That is a real loss and a small one, and if it is ever reported the answer
is a per-tab override rather than reverting this.

### B. Follow all four, by reloading a tab whose language key changed

The only way language could follow today, and it is refused. A reload is
already the decision for the tab the player pressed the control in, where they
asked for it and the code can `await controller.saveNow()` first. Doing it to a
tab the player is not looking at interrupts a game in progress to apply a
preference expressed somewhere else, and does it without warning — and the
`pagehide` save a reload triggers is explicitly not awaited
(`src/persistence/session/lifecycle.ts:68`), so it can cost play.

### C. Follow all four, by re-texting whatever can be re-texted

Refused, and it is the option that would *look* like it worked. The split would
not be random: `WorldSceneOptions.roomName` closes over the localizer
(`src/main.ts:658`) and `RoomLabelLayer` re-reads it on every refresh
(`src/rendering/phaser/room-label-layer.ts:127`, which re-texts a label whose
name changed), while tab labels, section
headings and `aria-label`s are formatted once at construction. So the map would
turn Polish under an English HUD — which #663 already named as *"worse than
either"*.

### D. Put the subscription in a UI module

Refused on the boundary this repository already draws.
`tests/unit/ui-orchestration-boundaries.test.ts` records that a value import of
`src/input/storage.ts` into a UI module *"would be the erosion to catch"*, and
an earlier draft of `src/ui/theme.ts` did it. The keys are properties of the
storage layer, so the subscription is beside them and takes its event target as
a parameter — no module under `src/input/` gains a browser global, which
`tests/unit/input-module-boundaries.test.ts` pins to exactly two seams.

## What this does not decide

- **Whether a future surface may switch language in place.** Unchanged from the
  language draft: if a screen is ever built whose text all flows from a view
  model recomputed per frame, nothing here forbids it from following.
- **The embed previews.** The delivery's `:38` rule — a per-iframe in-memory
  store — is about a context this repository does not yet ship, and a store
  that is not `localStorage` emits no `storage` event, so it is unaffected
  either way.
- **Keyboard remaps.** `lockstate.settings.input` is the fifth key and is not
  in scope: nothing in the assembled page re-reads bindings after boot, so it
  is the language's problem rather than the theme's, and no one has asked for
  it.

## What would change my mind

A report of a player using two tabs deliberately at different scales or themes.
That is the case alternative A protects and this decision gives up, and it is
the only evidence that would make a per-tab override worth the second control.
