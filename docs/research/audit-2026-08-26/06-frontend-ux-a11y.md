# Audit 06 — Frontend / UX / Accessibility / Localization / Input

Repository: `/workspace/lockstate` · Read-only audit · Baseline: typecheck clean, 2628 tests pass.
Scope owner: frontend, HUD (`src/ui/**`), rendering (`src/rendering/**`), input (`src/input/**`),
localization (`src/services/localization/**`), browser suite (`tests/browser/*.spec.ts`).

Docs read first: `AGENTS.md`, `docs/INPUT.md`, `docs/LOCALIZATION.md`, `docs/HUD_PROJECTIONS.md`,
`docs/RENDERING.md`, `docs/CAMERA.md`, ADRs 0011, 0022, 0025, 0031, 0035.

Note on method: this repository documents its own gaps unusually well. Where a doc already names a
gap I say so and do not claim discovery; the findings below are things that are **true of the code**
and that a player would hit, whether or not prose somewhere concedes them.

---

## Findings

| ID | Title | Severity | Status | Where |
| --- | --- | --- | --- | --- |
| UXA-01 | A keyboard-only or screen-reader player cannot zone a room, and therefore cannot admit a prisoner | **Critical** | CONFIRMED | `src/ui/hud/rooms-panel.ts:1-16`, `:147-149` |
| UXA-02 | The world has zero representation in the accessibility tree | **Critical** | CONFIRMED | `index.html:10-12`, `src/main.ts:281-301` |
| UXA-03 | No remapping surface exists; AGENTS.md boundary 10 is unmet at the player level | **High** | CONFIRMED | `src/input/storage.ts:132`, `src/input/bindings.ts:89` |
| UXA-04 | Arrow keys pan the camera while a `<select>` owns focus — #201 re-opened for a new control | **High** | CONFIRMED | `src/input/focus.ts:25-29`, `src/ui/hud/build-panel.ts:592` |
| UXA-05 | Ctrl/Cmd chords reach game actions, so browser zoom also zooms the camera | **High** | CONFIRMED | `src/input/keyboard.ts:4-7`, `src/rendering/scene/world-scene.ts:317-336` |
| UXA-06 | Room zoning on the map is carried by hue alone; two categories are indistinguishable to a deuteranope | **High** | CONFIRMED | `src/rendering/world/appearance.ts:79-101` |
| UXA-07 | The whole localization runtime is orphaned: no locale detection, no catalog loading, no missing-key reporting, no locale switcher | **High** | CONFIRMED | `src/main.ts:827` |
| UXA-08 | `reducedMotion` and `uiScale` are stored preferences that nothing reads and nothing can set | **High** | CONFIRMED | `src/input/accessibility.ts:1-13`, `src/input/storage.ts:136-142` |
| UXA-09 | Protocol faults are invisible on a phone and unannounced everywhere | **High** | CONFIRMED | `src/ui/hud/hud.css:1823`, `src/ui/hud/hud-state.ts:51-53` |
| UXA-10 | `role="radiogroup"` without roving tabindex or arrow keys | **Medium** | CONFIRMED | `src/ui/primitives/choice-group.ts:44`, `:69` |
| UXA-11 | Focus is never managed: nothing in `src/ui/**` calls `.focus()` | **Medium** | CONFIRMED | absence across `src/ui/**` |
| UXA-12 | No `rem`/`em` type scale: a browser font-size preference is ignored | **Medium** | CONFIRMED | `src/ui/tokens.css:131-133` |
| UXA-13 | Camera scroll is unbounded and the minimap is a placeholder | **Medium** | CONFIRMED | `src/rendering/scene/world-scene.ts:441-486`, `src/content/default-locale-en.ts:177` |
| UXA-14 | No WebGL context-loss handling | **Medium** | CONFIRMED | `src/main.ts:281-303` |
| UXA-15 | Undo/redo exist only as unlabelled bare keys — no control, no discoverability, nothing on touch | **Medium** | CONFIRMED | `src/input/bindings.ts:71-72`, `src/ui/build-tool.ts:180-184` |
| UXA-16 | Sentences assembled from fragments in code (`×{n}`, `"{action}: {label}"`) | **Medium** | CONFIRMED | `src/ui/hud/status-strip.ts:114`, `:226`, `src/ui/hud/build-panel.ts:1388` |
| UXA-17 | Zero RTL readiness: 18 physical-direction CSS declarations, no logical properties, `dir` never set | **Medium** | CONFIRMED | `src/ui/hud/hud.css`, `src/ui/primitives/primitives.css` |
| UXA-18 | Reduced-motion support covers two chevrons; the renderer ignores it entirely | **Medium** | CONFIRMED | `src/ui/primitives/primitives.css:424-430` |
| UXA-19 | The pseudo-locale gate is pointed at one of eight player-facing surfaces | **Medium** | CONFIRMED | `tests/browser/ui-shell.spec.ts:299-322` |
| UXA-20 | `localization-key-completeness` cannot see a key that is not a `xKey: '…'` single-quoted literal | **Medium** | CONFIRMED | `tests/foundation/localization-key-completeness.test.ts:78` |
| UXA-21 | The browser suite never presses Tab: no focus-order, focus-visible or a11y-tree coverage | **Medium** | CONFIRMED | `tests/browser/*.spec.ts` |
| UXA-22 | `--text-muted` and `--accent-deep` fall below 4.5:1 on the surfaces they can land on | **Low** | CONFIRMED | `src/ui/tokens.css:39,51,77,84` |
| UXA-23 | Hairline borders are 1.18–1.90:1 — below the 3:1 non-text minimum | **Low** | CONFIRMED | `src/ui/tokens.css:42-45` |
| UXA-24 | `<h2>` panels with no `<h1>` anywhere on the page | **Low** | CONFIRMED | `src/ui/primitives/panel.ts:40`, `index.html:10-12` |
| UXA-25 | No touch dead zone, no long-press, no tap feedback | **Low** | CONFIRMED | `src/input/gestures.ts:41-47`, `src/styles.css:26-29` |
| UXA-26 | `<html lang="en">` is static; page language never follows the locale | **Low** | CONFIRMED | `index.html:2` |
| UXA-27 | `touch-action: none` on `body` blocks pinch-zoom of the page over the world | **Low** | CONFIRMED | `src/styles.css:22` |
| UXA-28 | Diagnostic cause of a failed action reaches only `console.warn` | **Low** | CONFIRMED | `src/main.ts:2031` |

Counts: 2 Critical, 7 High, 12 Medium, 7 Low.

---

## Details

### UXA-01 — A keyboard-only player cannot zone a room, and so cannot play (Critical, CONFIRMED)

`src/ui/hud/rooms-panel.ts` imports `createActionButton`, `createCollapsibleSection`,
`createListRow`, `createPanel` — and **no** `createNumberField` (`:1-16`). The only way an area
enters the panel is `setArea` / `setPendingArea` (`:147-149`), and both are fed by the world drag
that `HudWorldRoomSource.attachReadout` supplies (`src/ui/hud/hud.ts:161-166`). ADR 0022 states the
gesture *is* a rectangle drag. The Build panel deliberately kept a numeric fallback for exactly this
reason (`src/ui/hud/build-panel.ts:1399-1420`, two `createNumberField` calls plus an edge chooser
and a submit); the Rooms panel shipped without one.

Player impact — **keyboard-only player and screen-reader user**: zoning is not merely awkward, it is
impossible. And it is load-bearing: `hud.intake.hint` reads *"A prisoner can only be admitted into a
prison that has a room to hold them"* (`src/content/default-locale-en.ts:463`), so every press of
Admit is refused forever. A player who cannot use a pointer can build walls and buy bricks and can
never start the game's core loop.

Fix: give the Rooms panel the numeric route the Build panel has — x/y/width/height `createNumberField`s
feeding the same `onDesignate({ roomId, area })` the drag feeds, and the same for `onRemove`. The
confirm step ADR 0022 requires already exists and needs no change; the fields only have to produce a
`RoomsPanelArea`. Two `NumberField` pairs plus the existing confirm button is the whole surface.

### UXA-02 — The world has no accessibility-tree representation (Critical, CONFIRMED)

`index.html:10-12` is `<main id="app" aria-label="Lockstate game application"><div id="game-root">`.
Phaser injects a `<canvas>` into `#game-root` (`src/main.ts:283`) with no `role`, no `aria-label`, no
`tabindex` and no text alternative; nothing in `src/rendering/**` sets one (grep: no `aria` anywhere
under `src/rendering/`). The HUD is well labelled — see "genuinely solid" — but everything *spatial*
(where walls are, which tiles are zoned, where a prisoner is, what a build ghost is about to cover)
exists only as pixels.

Player impact — **screen-reader user**: the game state that matters is unreadable. The status strip
gives seven aggregate counts and the Rooms panel gives one "what is missing" line; there is no way to
answer "what is at tile 12,7", "is this rectangle enclosed before I release", or "did my wall get
built".

Fix: this is a design problem, not a patch, but the cheap first move is real: give the canvas
`role="img"` with an `aria-label` from a keyed sentence that summarises the visible world (tile
extent, room count by type, actor count), refreshed from the same projection the HUD already reads,
plus an `aria-live="polite"` off-screen line for build/zone outcomes. The projection layer
(`src/ui/hud/projection.ts`, `src/ui/simulation-projections.ts`) already carries the data.

### UXA-03 — No remapping surface (High, CONFIRMED)

AGENTS.md boundary 10: *"Input must support remapping, QWERTY/AZERTY and touch/pointer interaction."*
The machinery is complete and tested: `remapKeyboardBinding`, `remapAndPersistKeyboardBinding`,
`findBindingConflicts`, `validateInputSettings`, versioned `InputSettings`, a `KeyValueStore` seam,
`resolveKeyboardLabel` / `fallbackKeyboardLabel` for display. Callers in `src/` outside `src/input/`:

- `loadInputSettings` — one, `src/rendering/scene/world-scene.ts:259`.
- `saveInputSettings`, `remapAndPersistKeyboardBinding`, `resolveKeyboardLabel`,
  `fallbackKeyboardLabel`, `loadAccessibilitySettings`, `saveAccessibilitySettings` — **zero**.

So the read path is wired and the write path has no producer. A player cannot rebind anything, and
cannot see what any key does: `resolveKeyboardLabel` (`src/input/bindings.ts:96`) exists precisely to render a key label and has
no consumer (`docs/INPUT.md` concedes this for the label resolver; it does not concede that the whole
remap path is unreachable).

Player impact — **AZERTY player, keyboard-only player, any player with a non-standard layout or a
motor impairment**: WASD-by-physical-position is the right default and it works, but a player who
needs different keys has no route. A Dvorak or Colemak player gets four camera keys in physically
sensible but logically arbitrary positions and no way to change them.

Fix: a Settings panel in the HUD's rail slot listing `ACTION_REGISTRY` entries with
`resolveKeyboardLabel(binding.code)` as the visible label, a capture-next-keypress control, and
`remapAndPersistKeyboardBinding` on commit. Everything below the UI already exists.

### UXA-04 — Arrow keys pan the camera while a `<select>` owns focus (High, CONFIRMED)

`src/input/focus.ts:25-29` states the exclusion deliberately: *"a `<select>`, a slider or a button do
not [capture text], and treating them as text entry would make the camera stop for controls that
never wanted the keys."* That reasoning was written when the only bound keys were letters. Two things
landed afterwards:

1. `ArrowUp/Down/Left/Right` were bound to `camera.up/down/left/right` in `world`
   (`src/input/bindings.ts:29-32`, issue #200).
2. ADR 0035 added a native `<select>` — the catalogue category filter,
   `src/ui/hud/build-panel.ts:592`.

A focused `<select>` **does** consume ArrowUp/ArrowDown/Home/End. The keydown also reaches
`window` (`src/rendering/scene/world-scene.ts:335`), `isTextEntryFocused()` returns false for a
`<select>`, so `['world']` is active and `camera.up`/`camera.down` fire.

Player impact — **keyboard-only player**: changing the build category with the arrow keys scrolls the
world out from under them at the same time. This is exactly the #201 defect ("a real `<input>`
received the character `d` **and** the camera panned 249.6 world units") with a different control.

Fix: widen `isTextEntryFocused` to `select` — or, better, rename it and have it answer "does the
focused element consume keys the world is bound to", which is the question `activeContexts` actually
needs. `select` is the only new shape today; a `role="radiogroup"` (UXA-10) becomes the second the
moment it gets arrow keys.

### UXA-05 — Modifier chords reach game actions (High, CONFIRMED)

`KeyboardEventLike` is `{ code, repeat? }` (`src/input/keyboard.ts:4-7`); the adapter cannot see
`ctrlKey`/`metaKey`/`shiftKey`/`altKey`, and `world-scene.ts:317-336` registers the raw
`keydown`/`keyup` on `window` with no `preventDefault` anywhere in the file.
`docs/INPUT.md` and `src/input/bindings.ts:47-62` name the *undo* half of this honestly ("all three
reach this entry"). The half neither names is the collision the other direction:

- `Ctrl`/`Cmd` + `-` and `Ctrl`/`Cmd` + `=` are the browser's own zoom, and `Minus`/`Equal` are bound
  to `camera.zoom.out`/`camera.zoom.in` (`src/input/bindings.ts:33-34`). A player who zooms the
  browser to read the 11px HUD labels zooms the game camera at the same time — and since UXA-12
  leaves page zoom as the *only* text-scaling route, the two are coupled.
- `Ctrl+S` (save page) pans down, `Ctrl+D` (bookmark) pans right, `Ctrl+W` pans up on the way to
  closing the tab, `Cmd+Z` undoes a build order as well as whatever the browser thought.

Player impact — **low-vision player** (browser zoom is unusable), and **any player** using a
common chord over the canvas.

Fix: add a modifier field to `KeyboardBinding` and to the versioned settings schema — `docs/INPUT.md`
already raises this as an open schema decision — and until it exists, drop events carrying
`ctrlKey || metaKey || altKey` in the two `world-scene.ts` handlers. That one guard fixes the browser
collisions without touching the binding record and costs the `Ctrl+Z` coincidence, which the docs
already call a coincidence.

### UXA-06 — Zoning colour is the only carrier of room identity on the map (High, CONFIRMED)

`ZONING_TINT_BY_CATEGORY` (`src/rendering/world/appearance.ts:79-91`) assigns one hue to each of
eleven room categories, drawn at `ZONING_TINT_ALPHA = 0.28` (`:93`). Nothing else on the map
distinguishes a zone: no label, no hatch, no icon, no border style. `src/ui/primitives/status-badge.ts`
gets this exactly right for the HUD ("the tone is an *addition* to the text, never a replacement");
the renderer has no equivalent rule.

Simulated under a Machado severity-1.0 deuteranope transform, the closest pairs (RGB distance, max
441):

```
  9.2  operations (0xd0a24f) vs recreation (0x76d04f)
 18.0  housing    (0x4f7fd0) vs education  (0x9a4fd0)
 31.7  operations (0xd0a24f) vs food       (0xd0854f)
 32.9  administration (0x8f97a3) vs utility (0x4fd0a2)
```

At 0.28 alpha over terrain those separations shrink by roughly a further 3.5×, so the
operations/recreation pair is about 2.6 units apart on screen.

Player impact — **colour-blind player** (~8% of men): cannot tell a workshop from a yard, or a
dormitory from a classroom, by looking at their prison. Also affects any player on a poorly
calibrated display.

Fix: colour must stop being the only channel. Cheapest correct option is a per-category hatch
pattern or a per-category glyph drawn once per zoned region in `tile-layer.ts`, keyed off
`room.category` the same way the tint is. A hover/selection readout naming the room under the cursor
would help every player and is the same data `roomTint` already resolves.

### UXA-07 — The localization runtime is orphaned (High, CONFIRMED)

`src/main.ts:827`:

```ts
const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
```

That is the only `Localizer` construction in `src/`. Production callers of the rest of
`src/services/localization/**`: `selectSupportedLocale` — none. `MessageCatalogLoader` /
`loadMessageCatalog` — none. `onMissingKey` — none. `formatPlural` — none. `withLocale` — none.
`buildPseudoLocaleCatalog` — none (tests only).

Consequences, each a real one:

- **No locale is ever detected.** `navigator.languages` is never read. A French player gets English.
- **No second locale can be loaded**, because nothing implements the loader port. ADR 0011's async
  catalog path has no client.
- **A missing key is silent.** `Localizer.format` returns the key and calls `onMissingKey`; with no
  hook wired, a key that fails to resolve renders as `hud.build.queue-order` on screen with no
  counter, no telemetry event and no test failing in production. The two gates that catch this are
  build-time and both have holes (UXA-19, UXA-20).
- **No plural is ever selected.** `formatPlural` is unused, so every counted string goes through
  `format`, which takes `entry.value.other`. `hud.build.queue-count`, `hud.rooms.needs-count`,
  `save.list.item` and friends are all `other`-only today, which is correct English and wrong for
  Polish the moment a `pl` catalog exists — and the call sites would all have to change, which is
  precisely what ADR 0011 says a catalog change should not require.
- **The player cannot change locale.** There is no control.

Player impact — **non-English player**: none of the infrastructure is reachable. `docs/LOCALIZATION.md`
is honest that no second locale is *authored*; it does not say that the runtime has no wiring to load
one if it were.

Fix: in `src/main.ts`, replace the literal with
`selectSupportedLocale(navigator.languages, SUPPORTED_LOCALES)`, wire `onMissingKey` to
`src/services/telemetry` (or at minimum a `console.warn` counter), and set
`document.documentElement.lang` from `localizer.locale` (UXA-26). That is a handful of lines and
turns four tested-but-dead modules into shipped behaviour.

### UXA-08 — `reducedMotion` and `uiScale` are preferences nothing honours (High, CONFIRMED)

`src/input/accessibility.ts` declares, validates and defaults both fields; `src/input/storage.ts:136-142`
loads and saves them under `lockstate.settings.accessibility`. Callers outside `src/input/` and
`tests/`: **none**. No CSS reads a `uiScale` custom property; no renderer reads `reducedMotion`; no
control sets either.

AGENTS.md calls them "validated integration points", which is fair as an architecture statement and
misleading as a status: a player who needs reduced motion or larger UI has no route, and a reviewer
reading the settings record would reasonably assume otherwise.

Player impact — **player with vestibular sensitivity** (nothing stops the actor walk cycle or the
camera easing), **low-vision player** (`uiScale` would be the text-scaling answer UXA-12 lacks).

Fix: `loadAccessibilitySettings(store)` at boot; set `--ui-scale` on `:root` and multiply the type and
`--tap-target` tokens by it; gate the renderer's frame-advance on `reducedMotion` (see UXA-18); and
put two controls in the settings panel UXA-03 needs anyway.

### UXA-09 — Protocol faults are invisible on a phone and unannounced anywhere (High, CONFIRMED)

`src/ui/simulation-alerts.ts` maps all twelve `ProtocolFaultCode`s to keyed sentences — good work. But
where those rows land:

- `src/ui/hud/hud.ts:857-864` states deliberately that the refusal band **does not** take
  `protocol/error` rows: "a protocol fault is not a refusal of a player's command … one line cannot
  hold them". So faults live only in the alerts list.
- `src/ui/hud/hud.css:1823`: `@media (max-width: 720px) { .hud__corner { display: none; } }` — and
  the alerts section lives inside `.hud__corner` (`hud.ts:1140`).
- `src/ui/hud/hud-state.ts:51-53`: `collapsedPanels: ['alerts']` — the list starts folded, and
  `createCollapsibleSection` sets `body.hidden` while collapsed.
- `.hud-alerts__list` (`hud.ts:1110`) has **no** `aria-live` and no `role`. Only the unavailable band
  and the refusal band are live regions (`hud.ts:810`, `:893`).

So: on a phone a protocol fault is not in the DOM's visible tree at all; on desktop it is in a hidden
fold; and for a screen reader it is never announced on any viewport. The HUD's own comments identify
this exact shape as the #220 defect and fixed it for one sentence and for the refusal *class*; the
fault class was left behind.

Player impact — **touch player on a phone** gets a silently broken simulation with no message.
**Screen-reader user** on any viewport gets no notification when the worker faults.

Fix: give `.hud-alerts__list` `role="log" aria-live="polite"`, and route `severity: 'danger'` fault
rows to a band that survives the 720px breakpoint — either a third band beside unavailable/refusal
(the argument for separateness in `hud.ts:849-856` applies to faults as much as to "no worker"), or
auto-expand the alerts fold when a danger row arrives.

### UXA-10 — `role="radiogroup"` without the pattern it promises (Medium, CONFIRMED)

`src/ui/primitives/choice-group.ts:69` sets `role="radiogroup"` and `:44` sets `role="radio"` on each
`<button>`. Missing: a roving tabindex (every button stays `tabindex=0`) and any arrow-key handler.
`tab-button.ts:65-68` shows the author knows the rule — it reasons explicitly about roving tabindex
and applies it for `aria-selected` — so this is an inconsistency between two primitives, not an
unknown.

Consequence: an announced radiogroup where arrow keys select nothing and each option is its own tab
stop. And since a `role=radio` button is not text entry, the arrow keys instead pan the camera
(same root cause as UXA-04).

Player impact — **screen-reader user and keyboard-only player**: the edge chooser in the Build panel
behaves unlike every other radiogroup they have used, and pressing Left/Right to pick "West" scrolls
the world.

Fix: `button.tabIndex = active ? 0 : -1` in `apply()`, plus a `keydown` handler on the group root
moving selection on ArrowLeft/Right/Up/Down and Home/End and calling `preventDefault()`. Roughly
fifteen lines, and `tab-button.ts` already contains the reasoning to copy.

### UXA-11 — Focus is never managed (Medium, CONFIRMED)

`grep -rn "\.focus()" src/ui src/main.ts` returns nothing. Combined with two facts:

- `createBusyGroup` sets `control.disabled = busy` (`src/ui/primitives/async-action.ts:161`). A
  focused `<button>` that becomes `disabled` loses focus to `<body>`.
- Rows are removed from the DOM on success — the queue cancel path deletes the row whose button was
  just pressed (`src/ui/hud/build-panel.ts` queue paint; the held-guards and deliveries lists do the
  same).

Player impact — **keyboard-only player**: pressing "Cancel" on a queued order (or "Release" on a held
guard, or "Save now") drops focus to the top of the document. To cancel three orders they Tab from
the beginning three times. There is also no skip link and no focus move when a tab's panel changes,
so switching to the Build tab leaves focus on the tab button while the panel that appeared is many
tab stops away.

Fix: after a destructive row action, move focus to the next surviving row or to the section header
(`row.element.nextElementSibling` or `section.header.focus()`). For the busy group, prefer
`aria-disabled="true"` plus an early return in the click handler on the *pressed* control so it keeps
focus, and keep real `disabled` for the sibling controls. The comment at `async-action.ts:138` argues
for `disabled` on correctness grounds and is right about announcement; it does not consider focus
loss.

### UXA-12 — No relative type scale (Medium, CONFIRMED)

`src/ui/tokens.css:131-133`: `--text-size-value: 13px`, `--text-size-body: 13px`,
`--text-size-label: 11px`, `--tap-target: 44px` (`:150`), `--hud-strip-height: 48px`,
`--hud-rail-panel-width: 264px`. There is exactly one relative unit in the whole token file
(`--label-tracking: 0.14em`) and one in `primitives.css`. Every length is absolute.

Player impact — **low-vision player**: setting a larger default or minimum font size in the browser
changes nothing. The only route left is full page zoom, which UXA-05 couples to the game camera and
UXA-27 blocks on touch over the world. 11px uppercase labels with 0.14em tracking are the smallest
type in the interface and are not scalable by any means the player controls.

Fix: express the four type tokens and `--tap-target` in `rem`, and gate the measured layout floors
(`--hud-build-catalogue-floor` etc.) on `calc()` over those. This interacts with the height
measurements `hud.css` documents at 900×600, so it needs the browser suite's layout assertions
re-run — but those assertions are exactly what makes the change safe.

### UXA-13 — Unbounded panning, placeholder minimap (Medium, CONFIRMED)

`camera.setBounds` is never called. Pan writes `camera.scrollX/scrollY` directly from the middle-drag
(`world-scene.ts:441-442`), the two-finger pan (`:394-395`) and the key loop (`:485-486`), with no
clamp. Zoom is clamped (`ZOOM_BOUNDS`, `:65`); position is not. And `hud.minimap.placeholder` is
*"Minimap is not available yet"* (`src/content/default-locale-en.ts:177`).

Player impact — **any player, worst on touch**: a flick pans the camera into the void with no
landmark, no minimap, no "centre on prison" control and no bounds to stop at. Recovery is guessing
which direction to hold a key for how long.

Fix: either clamp scroll to `visibleWorldBounds` of the loaded chunk set plus a margin, or add a
"recentre" control to the HUD — one button, one camera write, no new state. The clamp is the smaller
change and `docs/CAMERA.md` leaves the choice open.

### UXA-14 — No WebGL context-loss handling (Medium, CONFIRMED)

`src/main.ts:281-303` configures `type: Phaser.AUTO` (so canvas fallback exists at *boot*), but
nothing anywhere subscribes to `webglcontextlost` / `webglcontextrestored` or Phaser's
`Core.Events.CONTEXT_LOST` / `CONTEXT_RESTORED`.

Player impact — **any player on a mobile GPU, a laptop that suspends, or after a driver reset**: the
canvas goes permanently black. The HUD keeps working and keeps saying nothing, so the player sees a
prison that has vanished with a live status strip on top of it. There is a band for exactly this
class of message already (`hud__unavailable`, `setUnavailable`) and it is not used for this.

Fix: subscribe to the two events; on loss call `setUnavailable` with a keyed sentence and on restore
clear it and force a world-revision repaint (the renderer already rebuilds from the next projection
rather than patching, so a repaint is the whole recovery).

### UXA-15 — Undo and redo have no control and no label (Medium, CONFIRMED)

The mechanism is complete: `ConstructionSystem` transactions, `EditHistoryPort`, `BuildTool`
(`src/ui/build-tool.ts:180-184`), HUD intents `{kind:'undo'}` / `{kind:'redo'}`
(`src/ui/hud/hud.ts:419-420`), refusal keys for both, dispatch in `src/main.ts:1496-1500`. The only
producer is two bare keys, `KeyZ` and `KeyY` (`src/input/bindings.ts:71-72`).

Player impact — **touch player** has no undo of any kind. ADR 0022's confirm step covers a stray
*room* drag, but a stray build drag commits a wall run immediately; recovery is the removal mode plus
one press per edge. **Keyboard player** has undo and no way to learn it exists: nothing renders a key
label (UXA-03), and `hud.build.arm-hint` names the arrow keys and the middle button but not Z/Y.

Fix: two `createIconButton`s in the Build panel (or the status strip) dispatching the intents that
already exist. Fifteen lines, no new machinery, and it makes the feature real on touch.

### UXA-16 — Sentences assembled in code (Medium, CONFIRMED)

`docs/LOCALIZATION.md` authoring rule 4: *"Keep punctuation and units inside the message; do not
assemble sentences from fragments in code — word order differs per language."* Three violations:

- `src/ui/hud/status-strip.ts:226` — `speed.textContent = \`×${localizer.formatNumber(...)}\``. The
  multiplication marker is a literal in code. `:114` hard-codes `'×1'` as the initial value.
- `src/ui/hud/build-panel.ts:1388` and `:1185-1188` — accessible names built as
  `` `${t(cancelKey)}: ${row.label.textContent}` ``. The `": "` separator is a code literal; CJK uses
  `：`, and RTL needs the parts in the other order.

Player impact — **non-English player**: a locale that writes speed as `2x`, `×2`, `2 фактор` or with a
different separator cannot express it, and a screen-reader user in that locale hears a name glued
with the wrong punctuation. Note this is the class of bug the pseudo-locale exists to catch and does
not, because these surfaces are not pseudo-localized (UXA-19).

Fix: `hud.clock.speed-value` with `{speed}` inside the message, and a
`hud.build.queue-cancel-named` / `…delivery-cancel-named` key with `{action}` and `{item}`. Three
catalog entries.

### UXA-17 — No RTL readiness (Medium, CONFIRMED)

`src/ui/hud/hud.css` and `src/ui/primitives/primitives.css` carry 18 physical-direction declarations
(`padding-left`, `border-left`, `text-align: left`, `left:`/`right:`) and **zero** logical properties
(`padding-inline`, `margin-inline`, `inset-inline`, `text-align: start`). `document.documentElement.dir`
is never set; there is no `[dir="rtl"]` rule anywhere. The HUD's grid is left-rail/right-rail by
absolute side.

Player impact — **Arabic or Hebrew player** (hypothetical today, since no locale ships): the entire
layout mirrors wrong, and the fix is a diffuse sweep rather than a switch. This is cheap to prevent
now and expensive to retrofit after the layout measurements in `hud.css` have been tuned further.

Fix: convert the 18 declarations to logical equivalents. `text-align: left` → `start`, `padding-left`
→ `padding-inline-start`, and the two `left:`/`right:` positions → `inset-inline-start`/`-end`. The
browser suite's x-coordinate assertions (`tabs.x >= 0`, `tabs.right <= 375`) hold unchanged in LTR.

### UXA-18 — Reduced motion covers two chevrons (Medium, CONFIRMED)

`src/ui/primitives/primitives.css:424-430` is the only `prefers-reduced-motion` block in the
repository, and it disables `transition` on `.ui-section__chevron` and `.ui-panel__toggle .ui-icon`.
Nothing in `src/rendering/**` consults the query or the `reducedMotion` setting: `actorFrameOrdinal`
advances the walk cycle from presentation time every frame regardless, and the anchored zoom / pan
run at full rate.

Player impact — **player with vestibular sensitivity**: the motion that could actually trigger
symptoms — a full-screen camera pan, a zoom, a crowd of animating sprites — is unaffected. The
motion that is suppressed is a 120ms chevron rotation.

Fix: read `matchMedia('(prefers-reduced-motion: reduce)')` **or** `reducedMotion` from UXA-08 at
boot; hold actors on their idle frame and make the pan/zoom steps instantaneous when set.

### UXA-19 — The pseudo-locale gate covers one surface (Medium, CONFIRMED)

`tests/browser/ui-harness.ts:691-698` accepts `{ pseudoLocale: true }` for **`mountSavePanel` only**.
`tests/browser/ui-shell.spec.ts:299-322` is the only consumer, and it asserts every rendered string
in the save panel is `⟦…⟧`-bracketed. ADR 0011 makes the pseudo-locale the designated detector of
hard-coded strings; it is currently pointed at 1 of 8 player-facing surfaces. Not covered: the HUD
shell, status strip, Build panel, Rooms panel, Staff panel, Intake panel, brand badge.

That is not hypothetical: UXA-16's three literals are in the status strip and the Build panel, and
they would fail a bracket assertion instantly.

Fix: add `pseudoLocale` to `mountHudShell` (the harness already builds a `pseudoLocalizer` at
`ui-harness.ts:246` — only the plumbing to `mountHud` is missing) and run the same bracket assertion
over `.hud` `innerText` on every tab.

### UXA-20 — The key-completeness scan sees only one literal shape (Medium, CONFIRMED)

`tests/foundation/localization-key-completeness.test.ts:78`:

```ts
for (const match of source.matchAll(/\b([A-Za-z][A-Za-z0-9]*Key)\s*:\s*'([^']+)'/g))
```

The scan is honest about being a regex, and the floors (`>= 74` declarations, `>= 9` files) protect
against coverage *shrinking*. What it structurally cannot see:

- A key that is a **`Record` value** rather than an `xKey:` field. `src/ui/simulation-alerts.ts`'s 36
  refusal keys and 12 fault keys are all of this shape; the file's own comment (`:29-32`) says so and
  points at a different test that does cover them — which is the right answer, and means the gate
  named in `docs/LOCALIZATION.md` is not the one doing the work.
- A key in **double quotes or backticks**, or composed at runtime (`` `intake-stage.${stage}.name` ``).
- Any **hard-coded English literal**, which is the failure ADR 0011 actually fears — a file that
  declares no keys "satisfies it trivially", as `save-panel-messages.ts:11-13` records.
- **Coverage across locales**: with one bundled locale there is nothing to compare, so no test would
  notice a second catalog arriving 40% empty.

Fix: the structural gap worth closing is unquoted/derived keys. Assert that every string literal in
`src/` matching `^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$` in a `.ts` file under `src/ui/` either resolves or
is on an explicit exemption list — the same shape as the `NON_LOCALIZATION_KEY_FIELDS` escape hatch
this test already uses well.

### UXA-21 — The browser suite never presses Tab (Medium, CONFIRMED)

Across `tests/browser/*.spec.ts`: `page.keyboard.press` appears only in `world-scene-input.spec.ts`
(for `Escape`, `Control+KeyZ` and the camera keys), `activeElement` is read only to prove the
text-entry context guard, and there is no `press('Tab')`, no focus-order assertion, no
`:focus-visible` check, no accessibility-tree snapshot and no axe run anywhere. The suite is otherwise
excellent — 100+ real-browser player-behaviour tests, tap targets measured against the token in both
axes at multiple viewports, refusals asserted to be words rather than dotted keys.

The consequence is that every finding UXA-01, -04, -10, -11 could ship and stay green: the suite
proves controls are *pressable by a pointer* and never that they are *reachable in order by a
keyboard*.

Also untested, in the same category: reduced-motion behaviour, `deviceScaleFactor` / DPI, forced
colours, and the Rooms panel with no pointer at all.

Fix: one spec that Tabs from `document.body` through the whole HUD at 1280×800 and 375×812, recording
the accessible name of each stop, and asserts (a) every interactive control appears exactly once,
(b) order matches DOM/grid order, (c) each stop has a visible outline. That single test is a
regression gate for four of the findings above.

### UXA-22 / UXA-23 — Contrast (Low, CONFIRMED)

Computed from `src/ui/tokens.css` (WCAG 2.x relative luminance):

| foreground | on `--surface-raised` #171c23 | on `--surface-active` #2a323e |
| --- | --- | --- |
| `--text-body` #dbe2e9 | 13.10 | 9.89 |
| `--text-subtle` #a8b1bc | 7.89 | 5.96 |
| `--text-muted` #7d8894 | 4.75 | **3.58** |
| `--accent-deep` #4a7fa5 | **3.97** | **3.00** |

`--text-muted` is the eyebrow colour (`primitives.css:32`) and the disabled-tab colour (`:310`), and
it drops below 4.5:1 on `--surface-active`. `--accent-deep` is below 4.5:1 on every surface; today it
is used as a border and as a fill (`primitives.css:262`, `:455`), not as text — so this is a trap laid
for the next author rather than a live defect. Badge foreground/background pairs all clear 4.48–6.87
after alpha compositing, which is good work.

Borders are the clearer miss: `--paper-alpha-07/13/22` composite to 1.18:1, 1.40:1 and 1.90:1 against
`--surface-base`, all below the 3:1 minimum for a component boundary. The design intent ("separation
comes from a 1px hairline and a background step, and from nothing else", `tokens.css:20-21`) is
exactly what makes this matter: for a low-vision player the panels have no visible edges.

Player impact — **low-vision player**: 11px eyebrow labels at 3.58:1, and panel boundaries at 1.18:1.

Fix: raise `--paper-alpha-13` to roughly `rgba(238,242,246,0.34)` for `--border` (≈3.0:1) and take
`--border-strong` higher; and either lighten `--paper-500` or stop using `--text-muted` on
`--surface-active`. Add a `prefers-contrast: more` block raising both. The `tokens.css` two-layer rule
means this is a one-file change, which is the payoff the file was designed for.

### UXA-24 — Heading hierarchy (Low, CONFIRMED)

`src/ui/primitives/panel.ts:40` emits `<h2>` per panel; `index.html:10-12` has `<main>` with no
heading at all. So a screen-reader user's heading list starts at level 2 with no document title
heading. Fix: an `<h1>` in `<main>` carrying the wordmark key the brand badge already resolves
(`brand.wordmark`), visually hidden if the badge occupies that space.

### UXA-25 — Touch details (Low, CONFIRMED)

`TouchGestureTracker.move` (`src/input/gestures.ts:41-47`) returns a `pan` for any non-zero movement —
no dead zone, so a 1px jitter during a tap moves the camera. There is no long-press gesture at all, so
touch has no "what is this" affordance over the world (which is also the only place room identity
lives — UXA-06). `src/styles.css:26-29` sets `-webkit-tap-highlight-color: transparent` globally, and
only two `:active` rules exist in `primitives.css`, so most controls give a touch player no press
feedback. Fix: a 4–6px threshold before the first `pan`, an `:active` background step on every
control class, and a long-press → inspect gesture.

### UXA-26 / UXA-27 — Page-level (Low, CONFIRMED)

`index.html:2` is `<html lang="en">`, never updated; once a second locale exists a screen reader will
read French text with an English voice. `src/styles.css:22` sets `touch-action: none` on `body`,
which suppresses browser pinch-zoom over the world (HUD surfaces restore it at `hud.css:67`) — the
right trade for a map, but it removes the only text-magnification route a touch player has, given
UXA-12 and UXA-08.

### UXA-28 — Diagnostic detail is console-only (Low, CONFIRMED)

`src/main.ts:2031`: `onError: (failure) => console.warn('HUD action failed', failure)`. The player gets
a keyed sentence per command kind (`hud.refusal.*`), which is the right design. But the *actionable*
half is discarded: `src/ui/simulation-commands.ts:191` throws *"The simulation has not reported its
command sequence yet; try again in a moment"* and what reaches the screen is a generic "that did not
happen". Fix: distinguish retryable host refusals with a second key so the sentence can say "try
again in a moment" without exposing the untranslated `Error` text ADR 0011 rightly bars.

---

## What is genuinely solid

This is a better-than-typical frontend for a game HUD, and several things are done properly rather
than nominally:

- **Colour is never the only carrier in the HUD.** `status-badge.ts` enforces it structurally — a
  badge cannot be constructed without text — and `segmented-bar.ts` carries `aria-valuetext` with a
  spoken form ("142 of 180"). The rule is stated at the primitive, not left to call sites.
- **Real semantics, not div soup.** `<nav>`, `<section>` + `<h2>`, `<header>`, `<label for>`,
  `role="region"`/`"group"`/`"meter"`, `aria-expanded`/`aria-controls` pairs with generated ids
  (`dom.ts:nextUiId`), and `aria-pressed` on toggles. Icon-only buttons carry their label as real
  DOM text (`icon-button.ts`), with `title` explicitly demoted to "a bonus for pointer users" —
  the correct call, and rare.
- **Two live regions that are actually correct.** `role="status"` + `aria-live="polite"` on the
  unavailable and refusal bands, with a genuinely careful `aria-describedby` handover
  (`hud.ts:940-970`): taking the line *unmarks* the previous control, because pointing a screen
  reader at a sentence about something else is worse than pointing at nothing. That is a level of
  care most production apps do not reach.
- **Refusal reason codes never leak.** `RefusalReason` → message key is an exhaustive
  `Record` over a closed union (`simulation-alerts.ts:33`), so a new reason fails the build until
  someone writes a sentence. Same for all twelve `ProtocolFaultCode`s. No enum name can reach a
  player. The browser suite asserts this in words ("says what each order is waiting for, in words
  rather than in dotted keys").
- **Async gating is a primitive, not a per-panel habit.** `AsyncActionGate` is single-slot by design,
  handles synchronous throws, never discards a promise, and `createBusyGroup` keeps the disabled set
  from drifting. Double-click protection is proven in a real browser ("a second create while one is
  in flight is refused, not issued").
- **QWERTY/AZERTY is right.** Bindings are physical `KeyboardEvent.code`, so WASD is ZQSD on AZERTY
  with no special case, and labels are display-only and never participate in lookup. The
  window-blur `releaseAll()` fix and the text-entry context guard are both real and both measured in
  a browser.
- **The simulation boundary holds.** No `localization` or `Intl` import anywhere in
  `src/simulation/**` or `src/persistence/**` — so locale formatting genuinely cannot leak into
  determinism, which was the specific risk ADR 0011 called out. The renderer never mutates
  simulation state (verified by reading, and pinned by
  `tests/unit/rendering-module-boundaries.test.ts:92` with an honest note about what it does not
  cover).
- **Responsiveness is measured, not guessed.** Breakpoints at 720px width and 700px height with the
  arithmetic written down, panel floors expressed as tokens so three rules cannot disagree, and
  browser assertions that every control is pressable at every viewport including 375×812. The
  horizontal-scroll question is answered: `overflow-x: auto` on the metrics strip only, `hidden`
  elsewhere, `overflow: hidden` on `body`.
- **Empty and loading states are handled deliberately.** "A blank rectangle is indistinguishable from
  a broken one" appears as a rule and is applied — empty rows for alerts, roles, held guards,
  catalogue; `--` for an unknown clock rather than a fabricated day 1; blocks that draw no box at all
  until they have content, asserted at every viewport.
- **The browser suite is unusually good at what it covers.** Tap targets measured against the token
  in both axes, real touch dispatched through CDP for pinch, pure camera transforms pinned against a
  live Phaser camera at five zoom levels, refusals traced from press to screen. The gap is keyboard
  and a11y, not rigour.

---

## Prioritized top 5

1. **UXA-01 — Give the Rooms panel a numeric route.** A keyboard-only player currently cannot zone a
   room, and zoning gates intake, so they cannot play the game at all. The Build panel's numeric
   fallback is the pattern to copy and the panel's `onDesignate`/`onRemove` callbacks already take
   the right shape. Smallest change with the largest impact in this report.
2. **UXA-05 + UXA-04 — Stop game actions firing on modifier chords and while a `<select>` has
   focus.** Two small guards: drop `keydown` carrying `ctrlKey || metaKey || altKey` in
   `world-scene.ts`, and add `select` to `isTextEntryFocused`. Together they un-break browser zoom
   for low-vision players and stop the camera scrolling while a keyboard player uses the category
   filter — the #201 defect re-opened.
3. **UXA-07 — Wire the localization runtime that already exists.** `selectSupportedLocale` on
   `navigator.languages`, `onMissingKey` to telemetry, `documentElement.lang` from the resolved
   locale. Four tested modules are dead code today and a missing key ships silently. Ten lines in
   `src/main.ts` converts infrastructure into behaviour.
4. **UXA-09 — Make a worker fault reachable.** Give `.hud-alerts__list` `role="log"
   aria-live="polite"` and route danger-severity faults to a band that survives the 720px
   breakpoint. Right now a phone player and a screen-reader user get a silently broken simulation,
   and the HUD's own comments identify this exact failure shape twice.
5. **UXA-21 — Add one keyboard-traversal browser test.** Tab through the HUD at two viewports and
   assert every control appears once, in DOM order, with a visible focus ring. It is the regression
   gate that would have caught UXA-01, -04, -10 and -11, and without it every fix above can silently
   regress.

Runner-up worth naming: **UXA-06**, room zoning by hue alone with `operations` and `recreation` 9.2/441
apart under deuteranopia — the only finding where the HUD's own excellent "colour is never alone" rule
was simply not carried across into the renderer.
